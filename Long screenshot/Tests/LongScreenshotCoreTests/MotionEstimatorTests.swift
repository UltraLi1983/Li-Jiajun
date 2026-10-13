import Testing
@testable import LongScreenshotCore

struct MotionEstimatorTests {
    @Test func knownVerticalShift() throws {
        let width = 90
        let height = 140
        let shift = 17
        func value(_ x: Int, _ globalY: Int) -> UInt8 {
            UInt8(truncatingIfNeeded: (x * 37 + globalY * 61 + (x * globalY) % 127) % 256)
        }
        let first = try GrayFrame(width: width, height: height,
            pixels: (0..<height).flatMap { y in (0..<width).map { value($0, y) } })
        let second = try GrayFrame(width: width, height: height,
            pixels: (0..<height).flatMap { y in (0..<width).map { value($0, y + shift) } })
        let result = try MotionEstimator().estimate(previous: first, current: second, top: 10, bottom: 130)
        #expect(result.accepted)
        #expect(result.displacement == shift)
    }

    @Test func identicalFrameIsStationary() throws {
        let pixels = (0..<(90 * 140)).map { UInt8(truncatingIfNeeded: $0 * 19) }
        let frame = try GrayFrame(width: 90, height: 140, pixels: pixels)
        let result = try MotionEstimator().estimate(previous: frame, current: frame, top: 10, bottom: 130)
        #expect(result.accepted)
        #expect(result.displacement == 0)
    }

    @Test func reverseShift() throws {
        let width = 90, height = 140, shift = -13
        func value(_ x: Int, _ y: Int) -> UInt8 {
            UInt8(truncatingIfNeeded: (x * 37 + y * 61 + (x * y) % 127) % 256)
        }
        let first = try GrayFrame(width: width, height: height,
            pixels: (0..<height).flatMap { y in (0..<width).map { value($0, y + 30) } })
        let second = try GrayFrame(width: width, height: height,
            pixels: (0..<height).flatMap { y in (0..<width).map { value($0, y + 30 + shift) } })
        let result = try MotionEstimator().estimate(previous: first, current: second, top: 10, bottom: 130)
        #expect(result.accepted)
        #expect(result.displacement == shift)
    }

    @Test func reverseThenContinueAddsOnlyUnseenContent() throws {
        var planner = StitchPlanner()
        #expect(try planner.advance(by: 20) == 20)
        #expect(try planner.advance(by: -12) == 0)
        #expect(try planner.advance(by: 8) == 0)
        #expect(try planner.advance(by: 9) == 5)
        #expect(planner.furthestPosition == 25)
    }

    @Test func detectsFixedTopAndBottom() throws {
        let width = 90, height = 140, top = 12, bottom = 128, shift = 9
        func frame(offset: Int) throws -> GrayFrame {
            let pixels = (0..<height).flatMap { y in
                (0..<width).map { x -> UInt8 in
                    if y < top { return UInt8(truncatingIfNeeded: 70 + x * 3) }
                    if y >= bottom { return UInt8(truncatingIfNeeded: 120 + x * 5) }
                    return UInt8(truncatingIfNeeded: (x * 37 + (y + offset) * 61 + x * (y + offset)) % 256)
                }
            }
            return try GrayFrame(width: width, height: height, pixels: pixels)
        }
        let result = try ContentRegionDetector().detect(previous: frame(offset: 0),
                                                        current: frame(offset: shift), displacement: shift)
        #expect(result.top == top)
        #expect(result.bottom == bottom)
    }

    @Test func isolatesChangedBandWithoutLosingScrollPosition() throws {
        let width = 90, height = 140, shift = 17
        func value(_ x: Int, _ y: Int) -> UInt8 {
            UInt8(truncatingIfNeeded: (x * 37 + y * 61 + x * y) % 256)
        }
        let first = try GrayFrame(width: width, height: height,
            pixels: (0..<height).flatMap { y in (0..<width).map { value($0, y) } })
        let second = try GrayFrame(width: width, height: height,
            pixels: (0..<height).flatMap { y in (0..<width).map { x in
                (46..<83).contains(y) ? UInt8(0) : value(x, y + shift)
            } })
        let result = try MotionEstimator().estimate(previous: first, current: second, top: 10, bottom: 130)
        #expect(result.accepted)
        #expect(result.reason == "dynamic_content_recovered")
        #expect(result.displacement == shift)
        #expect(result.dynamicRows != nil)
    }

    @Test func changingStatusIndicatorDoesNotShortenFixedHeader() throws {
        let width = 90, height = 140, top = 20, bottom = 128, shift = 12
        func frame(offset: Int, changedIndicator: Bool) throws -> GrayFrame {
            let pixels = (0..<height).flatMap { y in
                (0..<width).map { x -> UInt8 in
                    if y < top {
                        if changedIndicator && (4..<10).contains(y) { return 220 }
                        return 25
                    }
                    if y >= bottom { return 30 }
                    return UInt8(truncatingIfNeeded: (x * 37 + (y + offset) * 61 + x * (y + offset)) % 256)
                }
            }
            return try GrayFrame(width: width, height: height, pixels: pixels)
        }
        let region = try ContentRegionDetector().detect(previous: frame(offset: 0, changedIndicator: false),
                                                        current: frame(offset: shift, changedIndicator: true),
                                                        displacement: shift)
        #expect(region.top == top)
        #expect(region.bottom == bottom)
    }
}
