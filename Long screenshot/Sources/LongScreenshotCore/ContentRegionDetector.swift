public struct ContentRegion {
    public let top: Int
    public let bottom: Int
}

/// Estimates fixed top and bottom bars from a pair that has confirmed motion.
public struct ContentRegionDetector {
    public init() {}

    public func detect(previous: GrayFrame, current: GrayFrame, displacement: Int) throws -> ContentRegion {
        guard previous.width == current.width, previous.height == current.height,
              displacement != 0 else { throw StitchError.invalidFrame }
        let height = previous.height
        let maxBar = max(1, height / 5)
        let xStart = max(1, previous.width / 20)
        let xEnd = previous.width - xStart
        var rowDifference = [Double](repeating: 0, count: height)
        for y in 0..<height {
            var staticSum = 0
            var count = 0
            for x in stride(from: xStart, to: xEnd, by: 2) {
                staticSum += abs(Int(previous.pixels[y * previous.width + x]) -
                                 Int(current.pixels[y * current.width + x]))
                count += 1
            }
            rowDifference[y] = Double(staticSum) / Double(max(1, count))
        }
        var top = 0
        // A status bar can contain a changing clock or recording indicator. Find a sustained
        // moving region rather than stopping at the first nonstatic row.
        for y in 0..<maxBar where y + 20 <= height {
            let windowMedian = rowDifference[y..<(y + 20)].sorted()[9]
            if rowDifference[y] > 7 && windowMedian > 12 {
                top = y
                break
            }
        }
        var bottom = height
        for y in stride(from: height - 1, through: height - maxBar, by: -1) {
            if rowDifference[y] > 7 { break }
            bottom = y
        }
        // A tiny run is normally compression noise, not a meaningful fixed bar.
        let minimumBar = max(6, height / 50)
        if top < minimumBar { top = 0 }
        if height - bottom < minimumBar { bottom = height }
        guard bottom - top >= 32 else { throw StitchError.uncertain("content_region_too_small") }
        return ContentRegion(top: top, bottom: bottom)
    }
}
