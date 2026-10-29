import Cocoa
import ApplicationServices
import AirwispCore

/// Turns Actions into synthetic macOS mouse events. Needs Accessibility permission.
final class InputInjector {
    private var leftDown = false
    private var rightDown = false
    private var cursor = CGPoint.zero
    private let source = CGEventSource(stateID: .hidSystemState)

    static func ensureAccessibility(prompt: Bool = true) -> Bool {
        let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt] as CFDictionary
        return AXIsProcessTrustedWithOptions(opts)
    }

    private func screenPoint(_ x: Double, _ y: Double) -> CGPoint {
        let b = CGDisplayBounds(CGMainDisplayID())
        return CGPoint(x: b.minX + CGFloat(x) * (b.width - 1), y: b.minY + CGFloat(y) * (b.height - 1))
    }

    func apply(_ actions: [Action]) {
        for a in actions {
            switch a {
            case let .move(x, y): move(screenPoint(x, y))
            case let .down(b): button(b, down: true)
            case let .up(b): button(b, down: false)
            case let .click(b): button(b, down: true); button(b, down: false)
            case let .scroll(dx, dy): scroll(dx: dx, dy: dy)
            case .haptic, .armed: break   // handled by controller
            }
        }
    }

    private func move(_ p: CGPoint) {
        cursor = p
        let type: CGEventType = leftDown ? .leftMouseDragged : (rightDown ? .rightMouseDragged : .mouseMoved)
        let btn: CGMouseButton = rightDown ? .right : .left
        CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: p, mouseButton: btn)?
            .post(tap: .cghidEventTap)
    }

    private func button(_ b: MouseButton, down: Bool) {
        let (type, btn): (CGEventType, CGMouseButton) = {
            switch (b, down) {
            case (.left, true): return (.leftMouseDown, .left)
            case (.left, false): return (.leftMouseUp, .left)
            case (.right, true): return (.rightMouseDown, .right)
            case (.right, false): return (.rightMouseUp, .right)
            }
        }()
        if b == .left { leftDown = down } else { rightDown = down }
        CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: cursor, mouseButton: btn)?
            .post(tap: .cghidEventTap)
    }

    private func scroll(dx: Double, dy: Double) {
        CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 2,
                wheel1: Int32(dy.rounded()), wheel2: Int32(dx.rounded()), wheel3: 0)?
            .post(tap: .cghidEventTap)
    }

    /// Release anything held (call on quit / disarm).
    func releaseAll() {
        if leftDown { button(.left, down: false) }
        if rightDown { button(.right, down: false) }
    }
}
