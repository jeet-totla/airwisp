import Foundation
import CoreMotion
import Network
import WatchKit
import HealthKit
import WatchConnectivity
import AirwispCore

/// Streams motion + gestures to the Mac over UDP (Bonjour-discovered) and plays haptics sent back.
/// A workout session keeps the app running with the wrist down so streaming doesn't stall.
final class Streamer: NSObject, ObservableObject, HKWorkoutSessionDelegate, WCSessionDelegate {
    @Published var status = "Searching for Mac…"
    @Published var connected = false
    @Published var running = false
    @Published var sensitivity = 1.0 { didSet { pinch.threshold = 0.0004 / max(sensitivity, 0.2) } }

    private let motion = CMMotionManager()
    private let queue = DispatchQueue(label: "airwisp.watch.net", qos: .userInteractive)
    private let opQueue: OperationQueue = { let q = OperationQueue(); q.maxConcurrentOperationCount = 1; q.qualityOfService = .userInteractive; return q }()
    private var browser: NWBrowser?
    private var conn: NWConnection?
    private var seq: UInt16 = 0
    private var pinch = PinchDetector()
    private var flip = FlipDetector()
    private let health = HKHealthStore()
    private var workout: HKWorkoutSession?
    private var imuDivider = 0
    private var viaPhone: Bool { !connected && WCSession.default.isReachable }

    // MARK: lifecycle
    func start() {
        guard !running else { return }
        running = true
        if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
        startWorkout()
        startBrowsing()
        startMotion()
    }

    func stop() {
        running = false
        motion.stopDeviceMotionUpdates()
        browser?.cancel(); conn?.cancel(); conn = nil
        workout?.end(); workout = nil
        connected = false; status = "Stopped"
    }

    // MARK: workout (extended runtime)
    private func startWorkout() {
        health.requestAuthorization(toShare: [HKObjectType.workoutType()], read: []) { [weak self] ok, _ in
            guard let self, ok else { return }
            let cfg = HKWorkoutConfiguration(); cfg.activityType = .other; cfg.locationType = .indoor
            guard let s = try? HKWorkoutSession(healthStore: self.health, configuration: cfg) else { return }
            s.delegate = self; self.workout = s; s.startActivity(with: Date())
        }
    }
    func workoutSession(_ s: HKWorkoutSession, didChangeTo to: HKWorkoutSessionState, from: HKWorkoutSessionState, date: Date) {}
    func workoutSession(_ s: HKWorkoutSession, didFailWithError error: Error) {}

    // MARK: network
    private func startBrowsing() {
        let b = NWBrowser(for: .bonjour(type: "_airwisp._udp", domain: nil), using: .udp)
        b.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self, self.conn == nil, let r = results.first else { return }
            self.connect(to: r.endpoint)
        }
        b.start(queue: queue)
        browser = b
    }

    private func connect(to ep: NWEndpoint) {
        let c = NWConnection(to: ep, using: .udp)
        c.stateUpdateHandler = { [weak self] st in
            guard let self else { return }
            switch st {
            case .ready:
                DispatchQueue.main.async { self.connected = true; self.status = "Connected" }
                self.send(.hello(seq: self.nextSeq(), tMs: self.ms(), name: WKInterfaceDevice.current().name))
                self.receiveLoop(c)
                self.scheduleHello()
            case .failed, .cancelled:
                DispatchQueue.main.async { self.connected = false; self.status = "Searching for Mac…" }
                self.conn = nil
                if self.running { self.browser?.cancel(); self.startBrowsing() }
            default: break
            }
        }
        conn = c
        c.start(queue: queue)
    }

    private func scheduleHello() {   // keepalive so the Mac's watchdog doesn't drop us
        queue.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self, self.running, self.conn != nil else { return }
            self.send(.hello(seq: self.nextSeq(), tMs: self.ms(), name: WKInterfaceDevice.current().name))
            self.scheduleHello()
        }
    }

    private func receiveLoop(_ c: NWConnection) {
        c.receiveMessage { [weak self] data, _, _, err in
            if let data, case let .haptic(_, _, kind)? = Codec.decode(data) {
                DispatchQueue.main.async { Self.play(kind) }
            }
            if err == nil { self?.receiveLoop(c) }
        }
    }

    static func play(_ k: HapticKind) {
        switch k {
        case .click: WKInterfaceDevice.current().play(.click)
        case .start: WKInterfaceDevice.current().play(.start)
        case .stop: WKInterfaceDevice.current().play(.stop)
        }
    }

    private func nextSeq() -> UInt16 { seq &+= 1; return seq }
    private func ms() -> UInt32 { UInt32(truncatingIfNeeded: Int(ProcessInfo.processInfo.systemUptime * 1000)) }
    private func send(_ m: Message) {
        let data = Codec.encode(m)
        if connected { conn?.send(content: data, completion: .contentProcessed { _ in }) }
        else if WCSession.isSupported(), WCSession.default.isReachable {   // fallback: relay through iPhone
            WCSession.default.sendMessageData(data, replyHandler: nil, errorHandler: nil)
        }
    }

    // MARK: WCSession (iPhone relay fallback + haptics back)
    func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {}
    func session(_ s: WCSession, didReceiveMessageData data: Data) {
        if case let .haptic(_, _, kind)? = Codec.decode(data) { DispatchQueue.main.async { Self.play(kind) } }
    }
    func sessionReachabilityDidChange(_ s: WCSession) {
        DispatchQueue.main.async { if !self.connected { self.status = s.isReachable ? "Via iPhone" : "Searching for Mac…" } }
    }

    // MARK: motion
    private func startMotion() {
        guard motion.isDeviceMotionAvailable else { status = "Motion unavailable"; return }
        motion.deviceMotionUpdateInterval = 1.0 / 100
        motion.startDeviceMotionUpdates(to: opQueue) { [weak self] dm, _ in
            guard let self, let dm else { return }
            let t = dm.timestamp
            let r = dm.rotationRate, a = dm.userAcceleration
            // Stream IMU at 50 Hz (every other sample) to halve radio load; detectors run at 100 Hz.
            self.imuDivider ^= 1
            if self.imuDivider == 0 {
                self.send(.imu(seq: self.nextSeq(), tMs: self.ms(),
                               gyro: SIMD3(Float(r.x), Float(r.y), Float(r.z)),
                               accel: SIMD3(Float(a.x), Float(a.y), Float(a.z))))
            }
            for s in self.pinch.feed(t: t, ax: a.x, ay: a.y, az: a.z) {
                self.event(s == .down ? .pinchDown : .pinchUp)
            }
            if self.flip.feed(t: t, rollRate: r.x) { self.event(.flip) }
        }
    }

    func event(_ code: WatchEventCode) {
        send(.event(seq: nextSeq(), tMs: ms(), code: code))
    }
}
