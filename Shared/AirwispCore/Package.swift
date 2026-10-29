// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AirwispCore",
    platforms: [.macOS(.v13), .iOS(.v16), .watchOS(.v9)],
    products: [.library(name: "AirwispCore", targets: ["AirwispCore"])],
    targets: [
        .target(name: "AirwispCore"),
        .testTarget(name: "AirwispCoreTests", dependencies: ["AirwispCore"]),
    ]
)
