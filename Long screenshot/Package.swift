// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LongScreenshot",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "LongScreenshotCore", targets: ["LongScreenshotCore"]),
        .executable(name: "longshot", targets: ["longshot"])
    ],
    targets: [
        .target(name: "LongScreenshotCore"),
        .executableTarget(name: "longshot", dependencies: ["LongScreenshotCore"]),
        .testTarget(name: "LongScreenshotCoreTests", dependencies: ["LongScreenshotCore"])
    ]
)
