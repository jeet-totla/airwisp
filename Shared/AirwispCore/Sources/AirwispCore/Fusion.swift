import Foundation

/// Complementary fusion of camera (absolute, slow) and watch gyro (relative, fast). Screen-unit coords.
public struct Fusion {
    public var alpha = 0.3
    public var gxGain = 0.35, gyGain = 0.35
    public var maxGyroAge = 0.25, learnRate = 0.02, cameraTimeout = 0.4
    public private(set) var x = 0.5, y = 0.5
    public private(set) var hasPos = false
    private var lastGyroT: Double?, lastCamT: Double?
    private var intGx = 0.0, intGy = 0.0
    private var lastCam: Point?

    public init() {}

    public func lost(_ t: Double) -> Bool { lastCamT == nil || t - lastCamT! > cameraTimeout }

    /// yawRate: rad/s moving the cursor horizontally; pitchRate: rad/s moving it vertically.
    @discardableResult
    public mutating func gyro(t: Double, yawRate: Double, pitchRate: Double) -> Point {
        guard hasPos else { lastGyroT = t; return Point(x, y) }
        if let lg = lastGyroT {
            let dt = t - lg
            if dt > 0, dt <= maxGyroAge, (lastCamT == nil || t - lastCamT! <= cameraTimeout) {
                let dx = yawRate * dt, dy = pitchRate * dt
                x = clamp01(x + dx * gxGain); y = clamp01(y + dy * gyGain)
                intGx += dx; intGy += dy
            }
        }
        lastGyroT = t
        return Point(x, y)
    }

    @discardableResult
    public mutating func camera(t: Double, ux: Double, uy: Double, confidence: Double = 1) -> Point {
        if !hasPos || (lastCamT != nil && t - lastCamT! > cameraTimeout) {
            x = ux; y = uy; hasPos = true
        } else {
            if let lc = lastCam {
                if abs(intGx) > 0.02 { gxGain += learnRate * (min(1.5, max(0.05, (ux - lc.x) / intGx)) - gxGain) }
                if abs(intGy) > 0.02 { gyGain += learnRate * (min(1.5, max(0.05, (uy - lc.y) / intGy)) - gyGain) }
            }
            let a = alpha * clamp01(confidence)
            x += a * (ux - x); y += a * (uy - y)
        }
        lastCam = Point(ux, uy); intGx = 0; intGy = 0; lastCamT = t
        return Point(x, y)
    }
}
