import SwiftUI

@main
struct AirwispPhoneApp: App {
    @StateObject private var relay = Relay()
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 16) {
                Image(systemName: "applewatch.radiowaves.left.and.right").font(.system(size: 56))
                Text("Airwisp").font(.largeTitle.bold())
                Text("Open Airwisp on your Apple Watch and tap Start. This app relays motion to your Mac when the Watch can't reach it directly.")
                    .multilineTextAlignment(.center).foregroundStyle(.secondary)
                HStack { Circle().fill(relay.macFound ? .green : .orange).frame(width: 10, height: 10)
                         Text(relay.macFound ? "Mac found" : "Looking for Mac…") }
                HStack { Circle().fill(relay.watchReachable ? .green : .orange).frame(width: 10, height: 10)
                         Text(relay.watchReachable ? "Watch connected" : "Watch not reachable") }
            }
            .padding(24)
        }
    }
}
