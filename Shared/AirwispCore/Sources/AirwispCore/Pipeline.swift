import Foundation

/// Glue: camera + watch inputs -> actions. Not thread-safe; call from one queue.
public final class Pipeline {
    public var mapper = Mapper()
    public var fusion = Fusion()
    public let gestures = GestureEngine()
    /// Watch frame: x along forearm, y across, z out of screen. Flip these if motion feels inverted.
    public var yawSign = -1.0, pitchSign = 1.0
    private var filt = OneEuro2D(minCutoff: 1.2, beta: 0.02)
    private var lastImuT: Double?

    public init() {}

    public func cameraFrame(t: Double, cx: Double, cy: Double, confidence: Double = 1,
                            pinchDist: Double? = nil, fist: Bool = false) -> [Action] {
        var acts: [Action] = []
        let u = mapper.toUnit(cx, cy)
        let f = fusion.camera(t: t, ux: u.x, uy: u.y, confidence: confidence)
        let s = filt.filter(f.x, f.y, t: t)
        acts += gestures.position(t: t, x: s.0, y: s.1)
        if let d = pinchDist { acts += gestures.cameraPinch(t: t, dist: d) }
        acts += gestures.cameraFist(t: t, isFist: fist)
        acts += gestures.tick(t: t)
        return acts
    }

    public func cameraLost(t: Double) -> [Action] { gestures.tick(t: t) }

    public func imu(t: Double, gx: Double, gy: Double, gz: Double) -> [Action] {
        var acts: [Action] = []
        gestures.touchWatch(t)
        let dt = lastImuT.map { t - $0 } ?? 0
        lastImuT = t
        let p = fusion.gyro(t: t, yawRate: yawSign * gz, pitchRate: pitchSign * gy)
        if fusion.hasPos && !fusion.lost(t) {
            let s = filt.filter(p.x, p.y, t: t)
            acts += gestures.position(t: t, x: s.0, y: s.1)
        }
        if dt > 0 { acts += gestures.scrollRate(dt: dt, rollRate: gx, yawRate: gz) }
        acts += gestures.tick(t: t)
        return acts
    }

    public func watchEvent(t: Double, code: WatchEventCode) -> [Action] {
        gestures.watchEvent(t: t, code: code)
    }
}
