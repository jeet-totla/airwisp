import XCTest
@testable import AirwispCore

final class ProtocolTests: XCTestCase {
    func testImuRoundtrip() {
        let m = Message.imu(seq: 7, tMs: 1234, gyro: SIMD3(1, 2, 3), accel: SIMD3(4, 5, 6))
        XCTAssertEqual(Codec.decode(Codec.encode(m)), m)
    }
    func testEventHelloHaptic() {
        for m in [Message.event(seq: 1, tMs: 2, code: .pinchDown),
                  .hello(seq: 1, tMs: 2, name: "Jeet's Watch"),
                  .haptic(seq: 1, tMs: 2, kind: .click)] {
            XCTAssertEqual(Codec.decode(Codec.encode(m)), m)
        }
    }
    func testRejectsGarbage() {
        XCTAssertNil(Codec.decode(Data()))
        XCTAssertNil(Codec.decode(Data(repeating: 0, count: 20)))
        let good = Codec.encode(.imu(seq: 1, tMs: 1, gyro: .zero, accel: .zero))
        XCTAssertNil(Codec.decode(good.dropLast()))
    }
    func testSeqWrap() {
        XCTAssertTrue(Codec.seqNewer(1, than: 0xFFFF))
        XCTAssertFalse(Codec.seqNewer(0xFFFF, than: 1))
        XCTAssertFalse(Codec.seqNewer(5, than: 5))
    }
}

final class FilterMapperTests: XCTestCase {
    func testOneEuroFirstSampleAndSmoothing() {
        var f = OneEuro(minCutoff: 1.0, beta: 0.0)
        var rng = SystemRandomNumberGenerator()
        let raw = (0..<300).map { _ in 0.5 + Double.random(in: -0.01...0.01, using: &rng) }
        var out: [Double] = []
        for (i, x) in raw.enumerated() { out.append(f.filter(x, t: Double(i) / 30)) }
        XCTAssertEqual(out[0], raw[0])
        func sd(_ a: ArraySlice<Double>) -> Double {
            let m = a.reduce(0, +) / Double(a.count)
            return (a.map { ($0 - m) * ($0 - m) }.reduce(0, +) / Double(a.count)).squareRoot()
        }
        XCTAssertLessThan(sd(out[30...]), 0.5 * sd(raw[30...]))
    }
    func testZoneMappingMirrorClamp() {
        let m = Mapper()
        let c = m.toUnit(0.5, 0.5)
        XCTAssertEqual(c.x, 0.5, accuracy: 1e-9); XCTAssertEqual(c.y, 0.5, accuracy: 1e-9)
        let e = m.toUnit(0.2, 0.25)
        XCTAssertEqual(e.x, 1.0, accuracy: 1e-9); XCTAssertEqual(e.y, 0.0, accuracy: 1e-9)
        XCTAssertEqual(m.toUnit(5, 5), Point(0, 1))
    }
    func testCalibrationCorners() {
        var m = Mapper()
        let tl = Point(0.7, 0.3), tr = Point(0.3, 0.32), bl = Point(0.72, 0.7), br = Point(0.28, 0.68)
        m.setCorners(tl: tl, tr: tr, bl: bl, br: br)
        for (p, ex, ey) in [(tl, 0.0, 0.0), (tr, 1.0, 0.0), (bl, 0.0, 1.0), (br, 1.0, 1.0)] {
            let u = m.toUnit(p.x, p.y)
            XCTAssertEqual(u.x, ex, accuracy: 1e-4); XCTAssertEqual(u.y, ey, accuracy: 1e-4)
        }
    }
}

final class FusionTests: XCTestCase {
    func testSnapThenFollow() {
        var f = Fusion()
        f.camera(t: 0, ux: 0.2, uy: 0.8)
        XCTAssertEqual(f.x, 0.2); XCTAssertEqual(f.y, 0.8)
        for i in 1..<60 { f.camera(t: Double(i) / 30, ux: 0.7, uy: 0.3) }
        XCTAssertEqual(f.x, 0.7, accuracy: 0.01); XCTAssertEqual(f.y, 0.3, accuracy: 0.01)
    }
    func testGyroBetweenFramesAndTimeout() {
        var f = Fusion()
        f.camera(t: 0, ux: 0.5, uy: 0.5)
        f.gyro(t: 0, yawRate: 0, pitchRate: 0)
        f.gyro(t: 0.01, yawRate: 1, pitchRate: 0)
        XCTAssertEqual(f.x, 0.5035, accuracy: 1e-9)
        let x = f.x
        f.gyro(t: 1.0, yawRate: 1, pitchRate: 0)
        XCTAssertEqual(f.x, x); XCTAssertTrue(f.lost(1.0))
    }
}

final class GestureTests: XCTestCase {
    func mk() -> GestureEngine { let g = GestureEngine(); _ = g.position(t: 0, x: 0.5, y: 0.5); return g }

    func testShortPinchClicks() {
        let g = mk()
        _ = g.watchEvent(t: 1.0, code: .pinchDown)
        XCTAssertTrue(g.position(t: 1.05, x: 0.505, y: 0.5).isEmpty)
        let a = g.watchEvent(t: 1.1, code: .pinchUp)
        XCTAssertTrue(a.contains(.click(.left))); XCTAssertTrue(a.contains(.haptic(.click)))
        XCTAssertEqual(a.first, .move(0.5, 0.5))
    }
    func testHoldDrags() {
        let g = mk()
        _ = g.watchEvent(t: 1.0, code: .pinchDown)
        XCTAssertTrue(g.tick(t: 1.3).contains(.down(.left)))
        XCTAssertEqual(g.position(t: 1.4, x: 0.6, y: 0.6), [.move(0.6, 0.6)])
        XCTAssertTrue(g.watchEvent(t: 1.5, code: .pinchUp).contains(.up(.left)))
    }
    func testMovePromotesToDrag() {
        let g = mk()
        _ = g.watchEvent(t: 1.0, code: .pinchDown)
        XCTAssertEqual(g.position(t: 1.05, x: 0.6, y: 0.5).first, .down(.left))
    }
    func testFlipDisarms() {
        let g = mk()
        XCTAssertTrue(g.watchEvent(t: 1, code: .flip).contains(.armed(false)))
        XCTAssertTrue(g.position(t: 1.1, x: 0.7, y: 0.7).isEmpty)
        XCTAssertTrue(g.watchEvent(t: 1.2, code: .pinchDown).isEmpty)
        _ = g.watchEvent(t: 1.3, code: .flip); XCTAssertTrue(g.armed)
    }
    func testDisarmWhileDraggingReleases() {
        let g = mk()
        _ = g.watchEvent(t: 1.0, code: .pinchDown); _ = g.tick(t: 1.3)
        XCTAssertEqual(g.watchEvent(t: 1.5, code: .flip).first, .up(.left))
    }
    func testDoublePinchRightClick() {
        let g = mk()
        _ = g.watchEvent(t: 1.0, code: .pinchDown)
        XCTAssertTrue(g.watchEvent(t: 1.2, code: .doublePinch).contains(.click(.right)))
        XCTAssertEqual(g.state, .idle)
    }
    func testCameraPinchFallback() {
        let g = mk(); g.touchWatch(1.0)
        XCTAssertTrue(g.cameraPinch(t: 1.1, dist: 0.01).isEmpty); XCTAssertEqual(g.state, .idle)
        let h = mk()
        _ = h.cameraPinch(t: 5, dist: 0.02)
        XCTAssertEqual(h.state, .pending)
        _ = h.cameraPinch(t: 5.05, dist: 0.06); XCTAssertEqual(h.state, .pending)
        XCTAssertTrue(h.cameraPinch(t: 5.1, dist: 0.1).contains(.click(.left)))
    }
    func testFistToggle() {
        let g = mk()
        XCTAssertTrue(g.cameraFist(t: 1.0, isFist: true).isEmpty)
        XCTAssertTrue(g.cameraFist(t: 1.7, isFist: true).contains(.armed(false)))
        XCTAssertTrue(g.cameraFist(t: 1.8, isFist: true).isEmpty)
    }
    func testScrollMode() {
        let g = mk()
        _ = g.watchEvent(t: 1, code: .scrollStart)
        XCTAssertTrue(g.position(t: 1.1, x: 0.9, y: 0.9).isEmpty)
        XCTAssertFalse(g.scrollRate(dt: 0.01, rollRate: 2, yawRate: 0).isEmpty)
        _ = g.watchEvent(t: 1.2, code: .scrollEnd)
        XCTAssertTrue(g.scrollRate(dt: 0.01, rollRate: 2, yawRate: 0).isEmpty)
    }
}

final class PipelineTests: XCTestCase {
    func testTracksCircleWithFusion() {
        let p = Pipeline()
        func truth(_ t: Double) -> (Double, Double) { (0.5 + 0.15 * cos(Double.pi * t), 0.5 + 0.15 * sin(Double.pi * t)) }
        var last = Point(0.5, 0.5), errs: [Double] = []
        var rng = SystemRandomNumberGenerator()
        for i in 0..<(4 * 100) {
            let t = Double(i) / 100
            if i % 3 == 0 {
                let (x, y) = truth(t)
                for a in p.cameraFrame(t: t, cx: x + Double.random(in: -0.004...0.004, using: &rng),
                                       cy: y + Double.random(in: -0.004...0.004, using: &rng)) {
                    if case let .move(mx, my) = a { last = Point(mx, my) }
                }
            } else if i > 0 {
                let (x0, y0) = truth(t - 0.01), (x1, y1) = truth(t)
                let yaw = (-(x1 - x0) * 100 / 0.6) / 0.35, pitch = ((y1 - y0) * 100 / 0.5) / 0.35
                for a in p.imu(t: t, gx: 0, gy: pitch, gz: -yaw) {
                    if case let .move(mx, my) = a { last = Point(mx, my) }
                }
            }
            if t > 1 {
                let (x, y) = truth(t); let u = p.mapper.toUnit(x, y)
                errs.append(hypot(last.x - u.x, last.y - u.y))
            }
        }
        XCTAssertLessThan(errs.reduce(0, +) / Double(errs.count), 0.08)
    }
}

final class DetectorTests: XCTestCase {
    func testPinchImpulseAndSlowMotion() {
        var d = PinchDetector()
        var sig: [PinchSignal] = []
        for i in 0..<300 { sig += d.feed(t: Double(i) / 100, ax: 0.05 * sin(2 * .pi * Double(i) / 100), ay: 0, az: 0) }
        XCTAssertTrue(sig.isEmpty)
        d = PinchDetector(); sig = []
        for i in 0..<340 {
            let a = 0.01 * sin(2 * .pi * Double(i) / 100) + ((315...317).contains(i) ? 0.08 : 0)
            sig += d.feed(t: Double(i) / 100, ax: a, ay: 0, az: 0)
        }
        XCTAssertEqual(sig.count, 2)
    }
    func testFlip() {
        var f = FlipDetector()
        XCTAssertTrue((0..<60).contains { f.feed(t: Double($0) / 100, rollRate: 6) })
        var g = FlipDetector()
        XCTAssertFalse((0..<300).contains { g.feed(t: Double($0) / 100, rollRate: 1) })
    }
}
