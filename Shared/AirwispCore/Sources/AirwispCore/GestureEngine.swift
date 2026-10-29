import Foundation

public enum MouseButton { case left, right }

public enum Action: Equatable {
    case move(Double, Double)
    case down(MouseButton), up(MouseButton), click(MouseButton)
    case scroll(dx: Double, dy: Double)
    case haptic(HapticKind)
    case armed(Bool)
}

public final class GestureEngine {
    public enum State { case idle, pending, dragging }

    public var dragHold = 0.25, dragMove = 0.02, fistHold = 0.6, watchTimeout = 1.0
    public var camPinchDown = 0.04, camPinchUp = 0.07, scrollGain = 40.0
    public private(set) var armed = true
    public private(set) var state = State.idle
    public private(set) var scrolling = false
    private var pos = Point(0.5, 0.5), anchor = Point(0.5, 0.5)
    private var pinchT = 0.0
    private var lastWatchT: Double?
    private var fistSince: Double?, fistFired = false
    private var camPinched = false

    public init() {}

    public func watchAlive(_ t: Double) -> Bool { lastWatchT.map { t - $0 <= watchTimeout } ?? false }
    public func touchWatch(_ t: Double) { lastWatchT = t }

    private func setArmed(_ on: Bool) -> [Action] {
        guard on != armed else { return [] }
        armed = on
        var out: [Action] = [.armed(on), .haptic(on ? .start : .stop)]
        if !on && state == .dragging { out.insert(.up(.left), at: 0) }
        if !on { state = .idle; scrolling = false }
        return out
    }

    /// Manual toggle (menu bar); does not count as watch activity.
    public func toggleArmed() -> [Action] { setArmed(!armed) }

    public func position(t: Double, x: Double, y: Double) -> [Action] {
        pos = Point(x, y)
        guard armed, !scrolling else { return [] }
        switch state {
        case .idle: return [.move(x, y)]
        case .pending:
            if abs(x - anchor.x) > dragMove || abs(y - anchor.y) > dragMove {
                state = .dragging
                return [.down(.left), .haptic(.start), .move(x, y)]
            }
            return []
        case .dragging: return [.move(x, y)]
        }
    }

    public func tick(t: Double) -> [Action] {
        if armed, state == .pending, t - pinchT >= dragHold {
            state = .dragging
            return [.down(.left), .haptic(.start)]
        }
        return []
    }

    public func watchEvent(t: Double, code: WatchEventCode) -> [Action] {
        touchWatch(t)
        if code == .flip { return setArmed(!armed) }
        guard armed else { return [] }
        switch code {
        case .pinchDown: return pinchDown(t)
        case .pinchUp: return pinchUp()
        case .doublePinch:
            state = .idle
            return [.move(anchor.x, anchor.y), .click(.right), .haptic(.click)]
        case .scrollStart: scrolling = true; return []
        case .scrollEnd: scrolling = false; return []
        case .flip: return []
        }
    }

    /// Forearm twist (roll) scrolls vertically; wrist swing (yaw) scrolls horizontally.
    public func scrollRate(dt: Double, rollRate: Double, yawRate: Double) -> [Action] {
        guard armed, scrolling else { return [] }
        return [.scroll(dx: -yawRate * dt * scrollGain, dy: -rollRate * dt * scrollGain)]
    }

    private func pinchDown(_ t: Double) -> [Action] {
        guard state == .idle else { return [] }
        state = .pending; anchor = pos; pinchT = t
        return []
    }

    private func pinchUp() -> [Action] {
        switch state {
        case .pending:
            state = .idle
            return [.move(anchor.x, anchor.y), .click(.left), .haptic(.click)]
        case .dragging:
            state = .idle
            return [.up(.left), .haptic(.click)]
        case .idle: return []
        }
    }

    public func cameraPinch(t: Double, dist: Double) -> [Action] {
        if watchAlive(t) || !armed { camPinched = false; return [] }
        if !camPinched && dist < camPinchDown { camPinched = true; return pinchDown(t) }
        if camPinched && dist > camPinchUp { camPinched = false; return pinchUp() }
        return []
    }

    public func cameraFist(t: Double, isFist: Bool) -> [Action] {
        guard isFist else { fistSince = nil; fistFired = false; return [] }
        if fistSince == nil { fistSince = t }
        if !fistFired, t - fistSince! >= fistHold { fistFired = true; return setArmed(!armed) }
        return []
    }
}
