import SwiftUI

@main
struct AirwispWatchApp: App {
    @StateObject private var streamer = Streamer()
    var body: some Scene {
        WindowGroup { WatchView(streamer: streamer) }
    }
}
