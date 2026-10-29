import Foundation
import AirwispCore
import Combine

/// Owns the pipeline. All pipeline mutation happens on `core`; published state is updated on main.
final class Controller: ObservableObject {
    static let shared = Controller()
    @Published var armed = true
    @Published var watchName: String?
    @Published var cameraOK = false
    @Published var accessibilityOK = false
    @Published var calibrated = false
    @Published var calibrationPrompt: String?
    @Published var fps = 0.0
    @Published var lastError: String?

    private let core = DispatchQueue(label: "airwisp.core", qos: .userInteractive)
    private let pipeline = Pipeline()
    private let injector = InputInjector()
    private let tracker = HandTracker()
    private let receiver = WatchReceiver()
    private var cal: Calibration?
    private var statusTimer: Timer?

    private static let calKey = "airwisp.calibration"

    init() {
        // Camera pinch thresholds are ratios of palm length (see HandTracker).
        pipeline.gestures.camPinchDown = 0.25
        pipeline.gestures.camPinchUp = 0.45
        loadCalibration()
    }

    func start() {
        accessibilityOK = InputInjector.ensureAccessibility()
        tracker.onSample = { [weak self] s, t in self?.core.async { self?.handle(sample: s, t: t) } }
        tracker.start { [weak self] ok in
            DispatchQueue.main.async {
                self?.cameraOK = ok
                if !ok { self?.lastError = "Camera unavailable. Grant access in System Settings > Privacy & Security > Camera." }
            }
        }
        receiver.onMessage = { [weak self] m in self?.core.async { self?.handle(message: m) } }
        receiver.onPeerChanged = { [weak self] name in DispatchQueue.main.async { self?.watchName = name } }
        do { try receiver.start() } catch { lastError = "Network listener failed: \(error.localizedDescription)" }
        statusTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.fps = self.tracker.fps
            if !self.accessibilityOK { self.accessibilityOK = InputInjector.ensureAccessibility(prompt: false) }
        }
    }

    func stop() {
        tracker.stop(); receiver.stop()
        core.sync { injector.releaseAll() }
    }

    func toggleArmed() {
        core.async { [self] in
            dispatch(pipeline.gestures.toggleArmed())
        }
    }

    // MARK: core queue

    private func handle(sample: HandSample?, t: Double) {
        if let cal, cal.active {
            collectCalibration(sample, t: t)
            return
        }
        guard let s = sample else { dispatch(pipeline.cameraLost(t: t)); return }
        let acts = pipeline.cameraFrame(t: t, cx: Double(s.index.x), cy: Double(s.index.y),
                                        confidence: s.confidence, pinchDist: s.pinchRatio, fist: s.isFist)
        dispatch(acts)
    }

    private func handle(message: Message) {
        let t = ProcessInfo.processInfo.systemUptime
        switch message {
        case let .imu(_, _, g, _): dispatch(pipeline.imu(t: t, gx: Double(g.x), gy: Double(g.y), gz: Double(g.z)))
        case let .event(_, _, code): dispatch(pipeline.watchEvent(t: t, code: code))
        case .hello, .haptic: break
        }
    }

    private func dispatch(_ actions: [Action]) {
        guard !actions.isEmpty else { return }
        injector.apply(actions)
        for a in actions {
            switch a {
            case let .haptic(k): receiver.sendHaptic(k)
            case let .armed(on):
                if !on { injector.releaseAll() }
                DispatchQueue.main.async { self.armed = on }
            default: break
            }
        }
    }

    // MARK: calibration

    struct Calibration {
        static let labels = ["top-left", "top-right", "bottom-left", "bottom-right"]
        var step = 0
        var stepStart = 0.0
        var samples: [CGPoint] = []
        var points: [Point] = []
        var active = true
        static let settle = 2.0, capture = 1.5
    }

    func startCalibration() {
        core.async { [self] in
            var c = Calibration()
            c.stepStart = ProcessInfo.processInfo.systemUptime
            cal = c
            injector.releaseAll()
            publishPrompt(step: 0, remaining: Calibration.settle + Calibration.capture)
        }
    }

    func cancelCalibration() { core.async { [self] in cal = nil; publishPrompt(nil) } }

    func resetCalibration() {
        core.async { [self] in
            pipeline.mapper.clearCalibration()
            UserDefaults.standard.removeObject(forKey: Self.calKey)
            DispatchQueue.main.async { self.calibrated = false }
        }
    }

    private func collectCalibration(_ s: HandSample?, t: Double) {
        guard var c = cal else { return }
        let el = t - c.stepStart
        if el >= Calibration.settle, let s { c.samples.append(s.index) }
        if el >= Calibration.settle + Calibration.capture {
            guard !c.samples.isEmpty else {            // hand not seen: retry this corner
                c.stepStart = t; cal = c
                publishPrompt(step: c.step, remaining: Calibration.settle + Calibration.capture, note: "Hand not detected, try again")
                return
            }
            let mx = c.samples.map { Double($0.x) }.reduce(0, +) / Double(c.samples.count)
            let my = c.samples.map { Double($0.y) }.reduce(0, +) / Double(c.samples.count)
            c.points.append(Point(mx, my)); c.samples = []; c.step += 1; c.stepStart = t
            if c.step == 4 {
                pipeline.mapper.setCorners(tl: c.points[0], tr: c.points[1], bl: c.points[2], br: c.points[3])
                saveCalibration(c.points)
                cal = nil
                publishPrompt(nil)
                DispatchQueue.main.async { self.calibrated = true }
                return
            }
        }
        cal = c
        publishPrompt(step: c.step, remaining: max(0, Calibration.settle + Calibration.capture - (t - c.stepStart)))
    }

    private func publishPrompt(step: Int, remaining: Double, note: String? = nil) {
        let phase = remaining > Calibration.capture ? "Point your index finger at the" : "Hold still at the"
        let text = "\(phase) \(Calibration.labels[step]) corner of your screen (\(step + 1)/4)" + (note.map { "\n\($0)" } ?? "")
        DispatchQueue.main.async { self.calibrationPrompt = text }
    }
    private func publishPrompt(_ text: String?) { DispatchQueue.main.async { self.calibrationPrompt = text } }

    private func saveCalibration(_ pts: [Point]) {
        UserDefaults.standard.set(pts.flatMap { [$0.x, $0.y] }, forKey: Self.calKey)
    }

    private func loadCalibration() {
        guard let a = UserDefaults.standard.array(forKey: Self.calKey) as? [Double], a.count == 8 else { return }
        pipeline.mapper.setCorners(tl: Point(a[0], a[1]), tr: Point(a[2], a[3]), bl: Point(a[4], a[5]), br: Point(a[6], a[7]))
        calibrated = true
    }
}
