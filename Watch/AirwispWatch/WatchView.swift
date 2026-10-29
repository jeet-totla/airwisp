import SwiftUI
import AirwispCore

struct WatchView: View {
    @ObservedObject var streamer: Streamer

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                HStack {
                    Circle().fill(streamer.connected ? Color.green : Color.orange).frame(width: 8, height: 8)
                    Text(streamer.status).font(.footnote)
                }
                Button(streamer.running ? "Stop" : "Start") {
                    streamer.running ? streamer.stop() : streamer.start()
                }
                .tint(streamer.running ? .red : .green)

                if streamer.running {
                    HoldButton(title: "Hold = pinch", down: { streamer.event(.pinchDown) }, up: { streamer.event(.pinchUp) })
                    HoldButton(title: "Hold = scroll", down: { streamer.event(.scrollStart) }, up: { streamer.event(.scrollEnd) })
                    Button("Right click") { streamer.event(.doublePinch) }
                    Button("On / Off") { streamer.event(.flip) }
                    VStack {
                        Text(String(format: "Pinch sensitivity %.1fx", streamer.sensitivity)).font(.caption2)
                        Slider(value: $streamer.sensitivity, in: 0.3...3, step: 0.1)
                    }
                }
            }
            .padding(.horizontal, 4)
        }
    }
}

/// Press-and-hold button: fires `down` on touch start and `up` on release. Doubles as a reliable
/// fallback/test path when IMU pinch detection needs tuning.
struct HoldButton: View {
    let title: String; let down: () -> Void; let up: () -> Void
    @State private var held = false
    var body: some View {
        Text(title)
            .frame(maxWidth: .infinity, minHeight: 38)
            .background(held ? Color.blue : Color.gray.opacity(0.35), in: RoundedRectangle(cornerRadius: 10))
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { _ in if !held { held = true; down() } }
                .onEnded { _ in held = false; up() })
    }
}
