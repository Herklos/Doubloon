// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DoubloonChecker",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
    ],
    products: [
        .library(
            name: "DoubloonChecker",
            targets: ["DoubloonChecker"]
        ),
    ],
    targets: [
        .target(
            name: "DoubloonChecker",
            path: "Sources/DoubloonChecker"
        ),
    ]
)
