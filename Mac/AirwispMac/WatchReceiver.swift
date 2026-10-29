import Foundation
import Network
import AirwispCore

/// UDP listener advertised over Bonjour. The Watch (or iPhone relay) finds it, sends IMU/events, and
/// receives haptic commands back on the same 5-tuple.
final class WatchReceiver {
    static let serviceType = "_airwisp._udp"
    static let port: NWEndpoint.Port = 49555

    var onMessage: ((Message) -> Void)?
    var onPeerChanged: ((String?) -> Void)?
    private var listener: NWListener?
    private var peer: NWConnection?
    private var peerName: String?
    private var haptSeq: UInt16 = 0
    private let queue = DispatchQueue(label: "airwisp.net", qos: .userInteractive)
    private var lastSeq: UInt16?
    private var lastRx = Date.distantPast
    private var watchdog: DispatchSourceTimer?

    func start() throws {
        let params = NWParameters.udp
        params.allowLocalEndpointReuse = true
        let l = try NWListener(using: params, on: Self.port)
        l.service = NWListener.Service(name: Host.current().localizedName ?? "Mac", type: Self.serviceType)
        l.newConnectionHandler = { [weak self] conn in self?.accept(conn) }
        l.stateUpdateHandler = { state in
            if case let .failed(err) = state { NSLog("Airwisp listener failed: \(err)") }
        }
        l.start(queue: queue)
        listener = l
        let w = DispatchSource.makeTimerSource(queue: queue)
        w.schedule(deadline: .now() + 1, repeating: 1)
        w.setEventHandler { [weak self] in
            guard let self, self.peerName != nil, Date().timeIntervalSince(self.lastRx) > 3 else { return }
            self.peerName = nil; self.peer?.cancel(); self.peer = nil
            self.onPeerChanged?(nil)
        }
        w.resume(); watchdog = w
    }

    func stop() { listener?.cancel(); watchdog?.cancel(); peer?.cancel() }

    private func accept(_ conn: NWConnection) {
        conn.start(queue: queue)
        receive(conn)
    }

    private func receive(_ conn: NWConnection) {
        conn.receiveMessage { [weak self] data, _, _, error in
            guard let self else { return }
            if let data, let msg = Codec.decode(data) {
                self.lastRx = Date()
                if case let .hello(_, _, name) = msg {
                    if self.peer !== conn { self.peer?.cancel(); self.peer = conn }
                    if self.peerName != name { self.peerName = name; self.onPeerChanged?(name) }
                } else if self.peer == nil {
                    self.peer = conn      // sender skipped hello; adopt it so haptics still work
                }
                if self.accept(seq: msg) { self.onMessage?(msg) }
            }
            if error == nil { self.receive(conn) }
        }
    }

    /// Drops reordered/duplicate IMU packets (UDP); events always pass.
    private func accept(seq msg: Message) -> Bool {
        guard case let .imu(seq, _, _, _) = msg else { return true }
        defer { lastSeq = seq }
        guard let last = lastSeq else { return true }
        return Codec.seqNewer(seq, than: last)
    }

    func sendHaptic(_ kind: HapticKind) {
        queue.async {
            guard let peer = self.peer else { return }
            self.haptSeq &+= 1
            let data = Codec.encode(.haptic(seq: self.haptSeq, tMs: 0, kind: kind))
            peer.send(content: data, completion: .contentProcessed { _ in })
        }
    }
}
