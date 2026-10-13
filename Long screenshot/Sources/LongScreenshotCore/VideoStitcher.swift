import AVFoundation
import CoreImage
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

private enum DeferredMatch: Error {
    case uncertain(String)
}

private struct ContentPatch {
    let image: CGImage
    let documentY: Int
}

private struct PendingPatch {
    let image: CGImage
    let gray: GrayFrame
    let rows: ClosedRange<Int>
    let position: Int
}

public struct FrameDiagnostic: Codable {
    public let timeSeconds: Double
    public let displacementPixels: Int
    public let overlapError: Double
    public let confidence: Double
    public let decision: String
}

public struct StitchReport: Codable {
    public var status: String
    public var reason: String?
    public var inputWidth: Int
    public var inputHeight: Int
    public var processingWidth: Int
    public var processingHeight: Int
    public var contentTop: Int?
    public var contentBottom: Int?
    public var framesExamined: Int
    public var framesDecoded: Int
    public var outputWidth: Int?
    public var outputHeight: Int?
    public var frames: [FrameDiagnostic]

    public init() {
        status = "failed"
        reason = nil
        inputWidth = 0
        inputHeight = 0
        processingWidth = 0
        processingHeight = 0
        contentTop = nil
        contentBottom = nil
        framesExamined = 0
        framesDecoded = 0
        outputWidth = nil
        outputHeight = nil
        frames = []
    }
}

public final class VideoStitcher {
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private let estimator = MotionEstimator()
    private let regionDetector = ContentRegionDetector()
    private let maxWidth: Int

    public init(maxWidth: Int = 720) {
        self.maxWidth = maxWidth
    }

    public func stitch(input: URL, output: URL, report: inout StitchReport) async throws {
        let asset = AVURLAsset(url: input)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        guard let track = tracks.first else { throw StitchError.unsupported("no_video_track") }
        let duration = CMTimeGetSeconds(try await asset.load(.duration))
        let regionObservationSeconds = duration.isFinite ? min(1.6, duration * 0.6) : 1.6
        let transform = try await track.load(.preferredTransform)
        guard transform.isIdentity else { throw StitchError.unsupported("rotated_video_not_yet_supported") }

        let reader = try AVAssetReader(asset: asset)
        let videoOutput = AVAssetReaderTrackOutput(track: track, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ])
        videoOutput.alwaysCopiesSampleData = false
        guard reader.canAdd(videoOutput) else { throw StitchError.processing("cannot_add_video_output") }
        reader.add(videoOutput)
        guard reader.startReading() else {
            throw StitchError.processing(reader.error?.localizedDescription ?? "reader_start_failed")
        }
        defer { reader.cancelReading() }

        var lastAcceptedTime = -Double.infinity
        var previous: GrayFrame?
        var strips: [CGImage] = []
        var totalHeight = 0
        var width = 0
        var cropTop = 0
        var cropBottom = 0
        var appended = 0
        var planner = StitchPlanner()
        var firstGray: GrayFrame?
        var initialRegion: ContentRegion?
        var initialMotion = 0
        var provisional: [(image: CGImage, newPixels: Int)] = []
        var patches: [ContentPatch] = []
        var pendingPatch: PendingPatch?
        var pending: (buffer: CVPixelBuffer, gray: GrayFrame, seconds: Double)?
        var tentative: (buffer: CVPixelBuffer, gray: GrayFrame, seconds: Double,
                        rows: ClosedRange<Int>)?
        var unresolved: (firstTime: Double, reason: String)?

        func acceptFrame(_ pixelBuffer: CVPixelBuffer, gray: GrayFrame, seconds: Double) throws {
            guard let image = ciContext.createCGImage(CIImage(cvPixelBuffer: pixelBuffer),
                                                      from: CGRect(x: 0, y: 0, width: width, height: report.processingHeight)) else {
                throw StitchError.processing("image_conversion_failed")
            }
            report.framesExamined += 1
            if let previous {
                let estimate = try estimator.estimate(previous: previous, current: gray,
                    top: cropTop, bottom: cropBottom)
                let displacement = estimate.displacement
                let unstableStart = planner.position == 0 && displacement < 0 && estimate.error > 10
                report.frames.append(FrameDiagnostic(timeSeconds: seconds,
                    displacementPixels: displacement, overlapError: estimate.error,
                    confidence: estimate.confidence,
                    decision: unstableStart ? "skipped_initial_frame_unstable" :
                        (estimate.accepted ? estimate.reason : "skipped_\(estimate.reason)")))
                if unstableStart { throw DeferredMatch.uncertain("initial_frame_unstable") }
                guard estimate.accepted else {
                    throw DeferredMatch.uncertain(estimate.reason)
                }
                if initialRegion == nil && displacement != 0 {
                    initialRegion = try regionDetector.detect(previous: previous,
                        current: gray, displacement: displacement)
                    initialMotion = abs(displacement)
                }
                if let awaiting = pendingPatch {
                    let visible = awaiting.rows.filter { row in
                        let newRow = row - displacement
                        return newRow >= cropTop && newRow < cropBottom
                    }
                    guard visible.count >= min(40, awaiting.rows.count / 2) else {
                        throw DeferredMatch.uncertain("dynamic_patch_left_viewport")
                    }
                    var sum = 0, count = 0
                    for index in stride(from: 0, to: visible.count, by: 2) {
                        let row = visible[index]
                        for x in stride(from: 4, to: gray.width - 4, by: 3) {
                            sum += abs(Int(awaiting.gray.pixels[row * gray.width + x]) -
                                       Int(gray.pixels[(row - displacement) * gray.width + x]))
                            count += 1
                        }
                    }
                    guard Double(sum) / Double(max(1, count)) <= 12 else {
                        throw DeferredMatch.uncertain("dynamic_patch_not_stable")
                    }
                    let documentY = awaiting.position + awaiting.rows.lowerBound - cropTop
                    let height = awaiting.rows.count
                    guard documentY >= 0, documentY + height <= totalHeight else {
                        throw StitchError.uncertain("dynamic_patch_outside_canvas")
                    }
                    let patch = try copiedStrip(from: awaiting.image,
                        y: awaiting.rows.lowerBound, height: height)
                    patches.append(ContentPatch(image: patch, documentY: documentY))
                    pendingPatch = nil
                }
                let newPixels = try planner.advance(by: displacement)
                if newPixels > 0 {
                    if report.contentTop == nil { provisional.append((image, newPixels)) }
                    let strip = try copiedStrip(from: image, y: cropBottom - newPixels,
                                                height: newPixels)
                    strips.append(strip)
                    totalHeight += newPixels
                    appended += 1
                }
                if report.contentTop == nil && planner.position >= 6 && displacement != 0 &&
                    seconds >= regionObservationSeconds, let initialRegion {
                    let baselineRegion: ContentRegion
                    if initialMotion < 6, let firstGray {
                        baselineRegion = try regionDetector.detect(previous: firstGray,
                            current: gray, displacement: planner.position)
                    } else {
                        baselineRegion = initialRegion
                    }
                    let recentRegion = try regionDetector.detect(previous: previous,
                        current: gray, displacement: displacement)
                    let correction = max(20, gray.height / 20)
                    cropTop = baselineRegion.top
                    cropBottom = abs(baselineRegion.bottom - recentRegion.bottom) > correction ?
                        recentRegion.bottom : baselineRegion.bottom
                    report.contentTop = cropTop
                    report.contentBottom = cropBottom
                    strips = []
                    totalHeight = 0
                    for segment in provisional {
                        let y = segment.newPixels == 0 ? cropTop : cropBottom - segment.newPixels
                        let height = segment.newPixels == 0 ? cropBottom - cropTop : segment.newPixels
                        let strip = try copiedStrip(from: segment.image, y: y, height: height)
                        strips.append(strip)
                        totalHeight += height
                    }
                    provisional = []
                }
                if let rows = estimate.dynamicRows {
                    guard report.contentTop != nil else {
                        throw StitchError.uncertain("dynamic_content_before_region_detection")
                    }
                    pendingPatch = PendingPatch(image: image, gray: gray,
                                                rows: rows, position: planner.position)
                }
            } else {
                firstGray = gray
                provisional.append((image, 0))
                let strip = try copiedStrip(from: image, y: cropTop,
                                            height: cropBottom - cropTop)
                strips.append(strip)
                totalHeight = cropBottom - cropTop
            }
            previous = gray
            lastAcceptedTime = seconds
            guard totalHeight <= 20_000 && width * totalHeight * 4 <= 200_000_000 else {
                throw StitchError.unsupported("output_too_large_for_prototype")
            }
        }

        func processCandidate(_ buffer: CVPixelBuffer, gray: GrayFrame, seconds: Double) throws {
            if let candidate = tentative {
                let following = try estimator.estimate(previous: candidate.gray, current: gray,
                    top: cropTop, bottom: cropBottom)
                var stable = following.accepted && following.dynamicRows == nil
                if stable {
                    var sum = 0, count = 0
                    for row in stride(from: candidate.rows.lowerBound,
                                      through: candidate.rows.upperBound, by: 2) {
                        let newRow = row - following.displacement
                        if newRow < cropTop || newRow >= cropBottom { continue }
                        for x in stride(from: 4, to: gray.width - 4, by: 3) {
                            sum += abs(Int(candidate.gray.pixels[row * gray.width + x]) -
                                       Int(gray.pixels[newRow * gray.width + x]))
                            count += 1
                        }
                    }
                    stable = count >= 300 && Double(sum) / Double(max(1, count)) <= 12
                }
                tentative = nil
                if stable {
                    try acceptFrame(candidate.buffer, gray: candidate.gray, seconds: candidate.seconds)
                    try acceptFrame(buffer, gray: gray, seconds: seconds)
                    unresolved = nil
                    return
                }
                report.frames.append(FrameDiagnostic(timeSeconds: candidate.seconds,
                    displacementPixels: 0, overlapError: following.error,
                    confidence: following.confidence, decision: "skipped_transient_dynamic_content"))
            }
            if let previous {
                let match = try estimator.estimate(previous: previous, current: gray,
                    top: cropTop, bottom: cropBottom)
                if let rows = match.dynamicRows {
                    tentative = (buffer, gray, seconds, rows)
                    return
                }
            }
            do {
                try acceptFrame(buffer, gray: gray, seconds: seconds)
                unresolved = nil
            } catch DeferredMatch.uncertain(let reason) {
                if unresolved == nil { unresolved = (seconds, reason) }
                let retryWindow = planner.position == 0 && appended == 0 ? 1.2 : 0.3
                if seconds - unresolved!.firstTime >= retryWindow {
                    throw StitchError.uncertain("\(reason) at \(String(format: "%.2f", seconds))s")
                }
            }
        }

        while let sample = videoOutput.copyNextSampleBuffer() {
            report.framesDecoded += 1
            let seconds = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
            guard seconds.isFinite else { continue }
            guard let pixelBuffer = CMSampleBufferGetImageBuffer(sample) else { continue }
            let frameWidth = CVPixelBufferGetWidth(pixelBuffer)
            let frameHeight = CVPixelBufferGetHeight(pixelBuffer)
            guard frameHeight > frameWidth else { throw StitchError.unsupported("portrait_only") }
            if width == 0 {
                report.inputWidth = frameWidth
                report.inputHeight = frameHeight
                width = maxWidth > 0 ? min(frameWidth, maxWidth) : frameWidth
                report.processingWidth = width
                report.processingHeight = Int(Double(frameHeight) * Double(width) / Double(frameWidth))
                cropTop = max(1, Int(Double(report.processingHeight) * 0.08))
                cropBottom = report.processingHeight - cropTop
            } else if report.inputWidth != frameWidth || report.inputHeight != frameHeight {
                throw StitchError.unsupported("changing_frame_size")
            }
            let workingBuffer = try width == frameWidth ? pixelBuffer : downsample(
                pixelBuffer, width: width, height: report.processingHeight)
            let gray = try grayscale(pixelBuffer: workingBuffer)
            if unresolved == nil, let previous, seconds - lastAcceptedTime < 0.2,
               coarseDifference(previous, gray) < 12 {
                pending = (workingBuffer, gray, seconds)
                continue
            }
            try processCandidate(workingBuffer, gray: gray, seconds: seconds)
            pending = nil
        }
        guard reader.status == .completed else {
            throw StitchError.processing(reader.error?.localizedDescription ?? "reader_failed")
        }
        if let pending { try processCandidate(pending.buffer, gray: pending.gray, seconds: pending.seconds) }
        if tentative != nil { throw StitchError.uncertain("dynamic_patch_unconfirmed_at_end") }
        if let unresolved {
            throw StitchError.uncertain("\(unresolved.reason) at \(String(format: "%.2f", unresolved.firstTime))s")
        }
        if pendingPatch != nil { throw StitchError.uncertain("dynamic_patch_unconfirmed_at_end") }
        guard appended > 0 else { throw StitchError.uncertain("no_verifiable_motion") }
        guard report.contentTop != nil else { throw StitchError.uncertain("insufficient_motion_for_region") }
        try writePNG(strips: strips, patches: patches, width: width, height: totalHeight, url: output)
        report.outputWidth = width
        report.outputHeight = totalHeight
        report.status = "success"
    }

    private func downsample(_ source: CVPixelBuffer, width: Int, height: Int) throws -> CVPixelBuffer {
        var destination: CVPixelBuffer?
        let attributes: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:]
        ]
        let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height,
                                         kCVPixelFormatType_32BGRA, attributes as CFDictionary,
                                         &destination)
        guard status == kCVReturnSuccess, let destination else {
            throw StitchError.processing("downsample_buffer_creation_failed")
        }
        let scale = CGFloat(width) / CGFloat(CVPixelBufferGetWidth(source))
        let image = CIImage(cvPixelBuffer: source).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        ciContext.render(image, to: destination)
        return destination
    }

    private func grayscale(pixelBuffer: CVPixelBuffer) throws -> GrayFrame {
        let width = max(1, CVPixelBufferGetWidth(pixelBuffer) / 2)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        var pixels = [UInt8](repeating: 0, count: width * height)
        guard CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly) == kCVReturnSuccess else {
            throw StitchError.processing("pixel_buffer_lock_failed")
        }
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            throw StitchError.processing("pixel_buffer_address_missing")
        }
        let data = base.assumingMemoryBound(to: UInt8.self)
        let rowBytes = CVPixelBufferGetBytesPerRow(pixelBuffer)
        for y in 0..<height {
            for x in 0..<width {
                let offset = y * rowBytes + 2 * x * 4
                let blue = Int(data[offset])
                let green = Int(data[offset + 1])
                let red = Int(data[offset + 2])
                pixels[y * width + x] = UInt8((29 * blue + 150 * green + 77 * red) >> 8)
            }
        }
        return try GrayFrame(width: width, height: height, pixels: pixels)
    }

    private func coarseDifference(_ previous: GrayFrame, _ current: GrayFrame) -> Double {
        var sum = 0
        var count = 0
        for y in stride(from: 0, to: previous.height, by: 4) {
            for x in stride(from: 0, to: previous.width, by: 4) {
                let index = y * previous.width + x
                sum += abs(Int(previous.pixels[index]) - Int(current.pixels[index]))
                count += 1
            }
        }
        return Double(sum) / Double(max(1, count))
    }

    private func copiedStrip(from image: CGImage, y: Int, height: Int) throws -> CGImage {
        guard height > 0,
              let source = image.cropping(to: CGRect(x: 0, y: y,
                                                     width: image.width, height: height)),
              let context = CGContext(data: nil, width: image.width, height: height,
                                      bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw StitchError.processing("crop_copy_failed")
        }
        context.draw(source, in: CGRect(x: 0, y: 0, width: image.width, height: height))
        guard let result = context.makeImage() else {
            throw StitchError.processing("crop_copy_failed")
        }
        return result
    }

    private func writePNG(strips: [CGImage], patches: [ContentPatch],
                          width: Int, height: Int, url: URL) throws {
        guard let context = CGContext(data: nil, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw StitchError.processing("canvas_allocation_failed")
        }
        var y = height
        for strip in strips {
            y -= strip.height
            context.draw(strip, in: CGRect(x: 0, y: y, width: width, height: strip.height))
        }
        for patch in patches {
            context.draw(patch.image, in: CGRect(x: 0,
                y: height - patch.documentY - patch.image.height,
                width: width, height: patch.image.height))
        }
        guard let result = context.makeImage(),
              let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            throw StitchError.processing("png_destination_failed")
        }
        CGImageDestinationAddImage(destination, result, nil)
        guard CGImageDestinationFinalize(destination) else {
            throw StitchError.processing("png_write_failed")
        }
    }
}
