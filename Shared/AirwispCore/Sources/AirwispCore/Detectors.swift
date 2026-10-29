import Foundation

public enum PinchSignal { case down, up }

/// Detects the small impulse a finger-thumb tap makes in user acceleration (g, gravity removed).
/// Tap model: `.down` at the impulse, `.up` after `releaseDelay`. Thresholds are tunable on-device.
public struct PinchDetector {
    public var threshold = 0.0004, ratio = 6.0, refractory = 0.25, releaseDelay = 0.09
    public var fastAlpha = 0.35, slowAlpha = 0.02, warmup = 1.0
    private var fast = 0.0, slow = 0.0, lastSpike = -1e9, t0: Double?
    private var pendingUp: Double?

    public init() {}

    public mutating func feed(t: Double, ax: Double, ay: Double, az: Double) -> [PinchSignal] {
        var out: [PinchSignal] = []
        if t0 == nil { t0 = t }
        let e = ax * ax + ay * ay + az * az
        fast += fastAlpha * (e - fast)
        slow += slowAlpha * (e - slow)
        if let u = pendingUp, t >= u { out.append(.up); pendingUp = nil }
        if t - t0! < warmup { return out }
        if fast > threshold, fast > ratio * max(slow, 1e-7), t - lastSpike >= refractory {
            lastSpike = t; pendingUp = t + releaseDelay
            out.append(.down)
        }
        return out
    }
}

/// Forearm flip: integrates roll rate over a sliding window; a fast ~140 degree twist fires once.
public struct FlipDetector {
    public var window = 0.6, angle = 2.4, cooldown = 1.5
    private var buf: [(t: Double, d: Double)] = []
    private var sum = 0.0, lastT: Double?, lastFire = -1e9

    public init() {}

    public mutating func feed(t: Double, rollRate: Double) -> Bool {
        if let lt = lastT { let d = rollRate * (t - lt); buf.append((t, d)); sum += d }
        lastT = t
        while let f = buf.first, t - f.t > window { sum -= f.d; buf.removeFirst() }
        if abs(sum) >= angle, t - lastFire >= cooldown {
            lastFire = t; buf.removeAll(); sum = 0
            return true
        }
        return false
    }
}
