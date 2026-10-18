import Foundation

public struct GrayFrame {
    public let width: Int
    public let height: Int
    public let pixels: [UInt8]

    public init(width: Int, height: Int, pixels: [UInt8]) throws {
        guard width > 0, height > 0, pixels.count == width * height else {
            throw StitchError.invalidFrame
        }
        self.width = width
        self.height = height
        self.pixels = pixels
    }
}

public struct MotionEstimate {
    public let displacement: Int
    public let error: Double
    public let runnerUpError: Double
    public let confidence: Double
    public let accepted: Bool
    public let reason: String
    public let dynamicRows: ClosedRange<Int>?
}

public enum StitchError: Error, CustomStringConvertible {
    case invalidFrame
    case unsupported(String)
    case uncertain(String)
    case processing(String)

    public var description: String {
        switch self {
        case .invalidFrame: return "invalid_frame"
        case .unsupported(let reason): return "unsupported: \(reason)"
        case .uncertain(let reason): return "uncertain: \(reason)"
        case .processing(let reason): return "processing: \(reason)"
        }
    }
}

public struct MotionEstimator {
    public init() {}

    /// Returns signed displacement in grayscale pixels. Positive means content enters at the bottom.
    public func estimate(previous: GrayFrame, current: GrayFrame, top: Int, bottom: Int) throws -> MotionEstimate {
        guard previous.width == current.width, previous.height == current.height,
              top >= 0, bottom <= previous.height, bottom - top >= 32 else {
            throw StitchError.invalidFrame
        }
        let regionHeight = bottom - top
        let maxShift = Int(Double(regionHeight) * 0.65)
        let minOverlap = Int(Double(regionHeight) * 0.35)
        let xStart = max(2, previous.width / 20)
        let xEnd = previous.width - xStart
        guard xEnd > xStart else { throw StitchError.invalidFrame }

        // A cheap row signature proposes shifts; pixel comparisons verify only those candidates.
        func signatures(_ frame: GrayFrame) -> [Int] {
            var values = [Int](repeating: 0, count: frame.height * 4)
            for y in top..<bottom {
                var sums = [Int](repeating: 0, count: 4)
                var counts = [Int](repeating: 0, count: 4)
                for x in stride(from: xStart, to: xEnd, by: 6) {
                    let band = min(3, (x - xStart) * 4 / (xEnd - xStart))
                    sums[band] += Int(frame.pixels[y * frame.width + x])
                    counts[band] += 1
                }
                for band in 0..<4 {
                    values[y * 4 + band] = sums[band] / max(1, counts[band])
                }
            }
            return values
        }
        let oldRows = signatures(previous)
        let newRows = signatures(current)
        var coarse: [(shift: Int, error: Double)] = []
        for shift in (-maxShift)...maxShift {
            let overlap = regionHeight - abs(shift)
            if overlap < minOverlap { continue }
            let yStart = top + max(0, -shift)
            let yEnd = bottom - max(0, shift)
            var sum = 0
            var count = 0
            for y in stride(from: yStart, to: yEnd, by: 3) {
                for band in 0..<4 {
                    sum += abs(oldRows[(y + shift) * 4 + band] - newRows[y * 4 + band])
                    count += 1
                }
            }
            coarse.append((shift, Double(sum) / Double(max(1, count))))
        }
        var centers: [Int] = [0]
        for entry in coarse.sorted(by: { $0.error < $1.error }) {
            if centers.allSatisfy({ abs($0 - entry.shift) >= 4 }) {
                centers.append(entry.shift)
            }
            if centers.count >= 12 { break }
        }
        var shifts = Set<Int>()
        for center in centers {
            for shift in (center - 2)...(center + 2) where abs(shift) <= maxShift {
                shifts.insert(shift)
            }
        }

        // Divide the content into horizontal bands, so one animated block cannot decide the motion.
        var candidates: [(shift: Int, error: Double, bandErrors: [Double])] = []
        for shift in shifts.sorted() {
            let overlap = regionHeight - abs(shift)
            if overlap < minOverlap { continue }
            let yStart = top + max(0, -shift)
            let yEnd = bottom - max(0, shift)
            var sums = [Double](repeating: 0, count: 3)
            var counts = [Int](repeating: 0, count: 3)
            for y in stride(from: yStart, to: yEnd, by: 2) {
                let band = min(2, (y - yStart) * 3 / overlap)
                for x in stride(from: xStart, to: xEnd, by: 3) {
                    let a = previous.pixels[(y + shift) * previous.width + x]
                    let b = current.pixels[y * current.width + x]
                    sums[band] += Double(abs(Int(a) - Int(b)))
                    counts[band] += 1
                }
            }
            if counts.contains(0) { continue }
            let errors = zip(sums, counts).map { $0 / Double($1) }
            let sorted = errors.sorted()
            // Median suppresses one local animation or overlay.
            candidates.append((shift, sorted[1], errors))
        }
        guard let best = candidates.min(by: { $0.error < $1.error }) else {
            throw StitchError.uncertain("insufficient_overlap")
        }
        let runnerUp = candidates.filter { abs($0.shift - best.shift) >= 4 }
            .map(\.error).min() ?? Double.infinity
        let confidence = runnerUp.isFinite ? max(0, 1 - best.error / max(runnerUp, 0.001)) : 1
        let consistentBands = best.bandErrors.filter { $0 <= max(22, best.error * 1.7) }.count
        let dynamicBand = best.bandErrors.contains { $0 > 30 }
        let accepted = best.error <= 20 && consistentBands >= 2 && !dynamicBand &&
            (best.shift == 0 || confidence >= 0.12)
        let reason: String
        if best.error > 20 { reason = "high_overlap_error" }
        else if consistentBands < 2 { reason = "inconsistent_bands" }
        else if dynamicBand { reason = "dynamic_content" }
        else if best.shift != 0 && confidence < 0.12 { reason = "ambiguous_displacement" }
        else { reason = "accepted" }
        if !accepted, let recovered = recoverLocalizedChange(previous: previous, current: current,
                top: top, bottom: bottom, maxShift: maxShift, xStart: xStart, xEnd: xEnd,
                oldRows: oldRows, newRows: newRows) {
            return recovered
        }
        return MotionEstimate(displacement: best.shift, error: best.error,
                              runnerUpError: runnerUp, confidence: confidence,
                              accepted: accepted, reason: reason, dynamicRows: nil)
    }

    /// A conservative fallback for a single block which finishes loading while still visible.
    private func recoverLocalizedChange(previous: GrayFrame, current: GrayFrame,
        top: Int, bottom: Int, maxShift: Int, xStart: Int, xEnd: Int,
        oldRows: [Int], newRows: [Int]) -> MotionEstimate? {
        let height = bottom - top
        var proposals: [(shift: Int, score: Double)] = []
        for shift in (-maxShift)...maxShift {
            let overlap = height - abs(shift)
            if overlap < height / 2 { continue }
            let start = top + max(0, -shift)
            var errors = [Double]()
            for tile in 0..<6 {
                let low = start + overlap * tile / 6
                let high = start + overlap * (tile + 1) / 6
                var sum = 0, count = 0
                for y in stride(from: low, to: high, by: 3) {
                    for band in 0..<4 {
                        sum += abs(oldRows[(y + shift) * 4 + band] - newRows[y * 4 + band])
                        count += 1
                    }
                }
                errors.append(Double(sum) / Double(max(1, count)))
            }
            proposals.append((shift, errors.sorted().prefix(3).reduce(0, +) / 3))
        }
        var centers = [Int]()
        for proposal in proposals.sorted(by: { $0.score < $1.score }) {
            if centers.allSatisfy({ abs($0 - proposal.shift) >= 5 }) { centers.append(proposal.shift) }
            if centers.count == 16 { break }
        }
        var tested = Set<Int>()
        for center in centers {
            for shift in (center - 3)...(center + 3) where abs(shift) <= maxShift { tested.insert(shift) }
        }
        struct Candidate { let shift: Int; let score: Double; let errors: [Double] }
        var candidates = [Candidate]()
        for shift in tested {
            let overlap = height - abs(shift)
            if overlap < height / 2 { continue }
            let start = top + max(0, -shift)
            var errors = [Double]()
            for tile in 0..<6 {
                let low = start + overlap * tile / 6
                let high = start + overlap * (tile + 1) / 6
                var sum = 0, count = 0
                for y in stride(from: low, to: high, by: 2) {
                    for x in stride(from: xStart, to: xEnd, by: 3) {
                        sum += abs(Int(previous.pixels[(y + shift) * previous.width + x]) -
                                   Int(current.pixels[y * current.width + x]))
                        count += 1
                    }
                }
                errors.append(Double(sum) / Double(max(1, count)))
            }
            let stable = errors.sorted().prefix(3)
            candidates.append(Candidate(shift: shift, score: stable.reduce(0, +) / 3, errors: errors))
        }
        guard let best = candidates.min(by: { $0.score < $1.score }) else { return nil }
        let second = candidates.filter { abs($0.shift - best.shift) >= 5 }.map(\.score).min() ?? .infinity
        let confidence = second.isFinite ? max(0, 1 - best.score / max(second, 0.001)) : 1
        let stable = best.errors.filter { $0 <= 10 }.count
        let changed = best.errors.enumerated().filter { $0.element > 24 }.map(\.offset)
        guard best.score <= 9, stable >= 3, confidence >= 0.2,
              !changed.isEmpty, changed.count <= 3,
              changed.last! - changed.first! + 1 == changed.count else { return nil }
        let overlap = height - abs(best.shift)
        let start = top + max(0, -best.shift)
        let firstRow = start + overlap * changed.first! / 6
        let lastRow = start + overlap * (changed.last! + 1) / 6 - 1
        return MotionEstimate(displacement: best.shift, error: best.score,
            runnerUpError: second, confidence: confidence, accepted: true,
            reason: "dynamic_content_recovered", dynamicRows: firstRow...lastRow)
    }
}
