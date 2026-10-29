import AVFoundation
import Vision

struct HandSample {
    var t: Double
    var index: CGPoint        // normalized, origin top-left, un-mirrored sensor view
    var confidence: Double
    var pinchRatio: Double?   // thumb-index distance / palm length
    var isFist: Bool
}

/// Webcam capture + Vision hand pose. Calls `onSample(nil, t)` when no hand is visible.
final class HandTracker: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    var onSample: ((HandSample?, Double) -> Void)?
    private(set) var fps: Double = 0
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "airwisp.camera", qos: .userInteractive)
    private lazy var request: VNDetectHumanHandPoseRequest = {
        let r = VNDetectHumanHandPoseRequest(); r.maximumHandCount = 1; return r
    }()
    private var lastFrameT = 0.0

    func start(completion: @escaping (Bool) -> Void) {
        AVCaptureDevice.requestAccess(for: .video) { [weak self] ok in
            guard ok, let self else { completion(false); return }
            self.queue.async { completion(self.configure()) }
        }
    }

    private func configure() -> Bool {
        session.beginConfiguration()
        session.sessionPreset = .vga640x480        // low res = low latency; Vision is fine at this size
        guard let dev = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: dev), session.canAddInput(input) else {
            session.commitConfiguration(); return false
        }
        session.addInput(input)
        let out = AVCaptureVideoDataOutput()
        out.alwaysDiscardsLateVideoFrames = true
        out.setSampleBufferDelegate(self, queue: queue)
        guard session.canAddOutput(out) else { session.commitConfiguration(); return false }
        session.addOutput(out)
        session.commitConfiguration()
        session.startRunning()
        return true
    }

    func stop() { queue.async { self.session.stopRunning() } }

    func captureOutput(_ output: AVCaptureOutput, didOutput sb: CMSampleBuffer, from: AVCaptureConnection) {
        let t = ProcessInfo.processInfo.systemUptime
        if lastFrameT > 0 { fps = 0.9 * fps + 0.1 / max(t - lastFrameT, 1e-3) }
        lastFrameT = t
        guard let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        let handler = VNImageRequestHandler(cvPixelBuffer: pb, orientation: .up, options: [:])
        guard (try? handler.perform([request])) != nil, let obs = request.results?.first else {
            onSample?(nil, t); return
        }
        onSample?(Self.sample(from: obs, t: t), t)
    }

    static func sample(from obs: VNHumanHandPoseObservation, t: Double) -> HandSample? {
        func pt(_ j: VNHumanHandPoseObservation.JointName, min: Float = 0.3) -> (CGPoint, Float)? {
            guard let p = try? obs.recognizedPoint(j), p.confidence >= min else { return nil }
            return (CGPoint(x: p.location.x, y: 1 - p.location.y), p.confidence)   // flip to top-left origin
        }
        guard let (idx, conf) = pt(.indexTip) else { return nil }
        var pinch: Double? = nil
        var fist = false
        if let wrist = pt(.wrist)?.0, let mcp = pt(.middleMCP)?.0 {
            let palm = max(dist(wrist, mcp), 1e-4)
            if let thumb = pt(.thumbTip)?.0 { pinch = dist(thumb, idx) / palm }
            let tips: [VNHumanHandPoseObservation.JointName] = [.indexTip, .middleTip, .ringTip, .littleTip]
            let pts = tips.compactMap { pt($0)?.0 }
            if pts.count == 4 { fist = pts.allSatisfy { dist($0, wrist) < palm * 1.1 } }
        }
        return HandSample(t: t, index: idx, confidence: Double(conf), pinchRatio: pinch, isFist: fist)
    }

    private static func dist(_ a: CGPoint, _ b: CGPoint) -> Double { Double(hypot(a.x - b.x, a.y - b.y)) }
}
