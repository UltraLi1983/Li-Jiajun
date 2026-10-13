/// Tracks the interval already represented in the output while the recording moves both ways.
public struct StitchPlanner {
    public private(set) var position = 0
    public private(set) var furthestPosition = 0

    public init() {}

    /// Number of new pixels to append from the bottom of the current frame.
    public mutating func advance(by displacement: Int) throws -> Int {
        let next = position + displacement
        guard next >= 0 else { throw StitchError.unsupported("scroll_before_initial_frame") }
        position = next
        let newPixels = max(0, position - furthestPosition)
        furthestPosition = max(furthestPosition, position)
        return newPixels
    }
}
