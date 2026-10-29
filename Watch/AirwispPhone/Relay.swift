import Foundation
import Network
import WatchConnectivity
import AirwispCore

/// Forwards Watch packets (WatchConnectivity) to the Mac over UDP and haptics back.
final class Relay: NSObject, ObservableObject, WCSessionDelegate {
    @Published var macFound = false
    @Published var watchReachable = false
    private var browser: NWBrowser?
    private var conn: NWConnection?
    private let queue = DispatchQueue(label: "airwisp.phone.net", qos: .userInteractive)

    override init() {
        super.init()
        if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
        startBrowsing()
    }

    private func startBrowsing() {
        let b = NWBrowser(for: .bonjour(type: "_airwisp._udp", domain: nil), using: .udp)
        b.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self, self.conn == nil, let r = results.first else { return }
            let c = NWConnection(to: r.endpoint, using: .udp)
            c.stateUpdateHandler = { st in
                if case .ready = st { DispatchQueue.main.async { self.macFound = true }; self.receive(c) }
                if case .failed = st { self.conn = nil; DispatchQueue.main.async { self.macFound = false } }
            }
            self.conn = c; c.start(queue: self.queue)
        }
        b.start(queue: queue)
        browser = b
    }

    private func receive(_ c: NWConnection) {
        c.receiveMessage { data, _, _, err in
            if let data, WCSession.default.isReachable {
                WCSession.default.sendMessageData(data, replyHandler: nil, errorHandler: nil)
            }
            if err == nil { self.receive(c) }
        }
    }

    // MARK: WCSessionDelegate
    func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ s: WCSession) {}
    func sessionDidDeactivate(_ s: WCSession) { s.activate() }
    func sessionReachabilityDidChange(_ s: WCSession) { DispatchQueue.main.async { self.watchReachable = s.isReachable } }
    func session(_ s: WCSession, didReceiveMessageData data: Data) {
        conn?.send(content: data, completion: .contentProcessed { _ in })
    }
}
