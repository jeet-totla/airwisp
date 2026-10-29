import SwiftUI

@main
struct AirwispApp: App {
    @StateObject private var controller = Controller.shared

    var body: some Scene {
        MenuBarExtra("Airwisp", systemImage: controller.armed ? "hand.point.up.left.fill" : "hand.raised.slash") {
            MenuView(controller: controller)
        }
        .menuBarExtraStyle(.window)

        Window("Calibration", id: "calibration") {
            CalibrationView(controller: controller)
        }
        .windowResizability(.contentSize)
    }

    init() {
        // Start services once at launch (MenuBarExtra content is lazy).
        DispatchQueue.main.async { Controller.shared.start() }
    }
}

struct MenuView: View {
    @ObservedObject var controller: Controller
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle("Airwisp on", isOn: Binding(get: { controller.armed }, set: { _ in controller.toggleArmed() }))
            Divider()
            StatusRow(label: "Camera", ok: controller.cameraOK, detail: controller.cameraOK ? String(format: "%.0f fps", controller.fps) : "off")
            StatusRow(label: "Apple Watch", ok: controller.watchName != nil, detail: controller.watchName ?? "not connected (camera-only mode)")
            StatusRow(label: "Accessibility", ok: controller.accessibilityOK, detail: controller.accessibilityOK ? "granted" : "needed to move the cursor")
            StatusRow(label: "Calibration", ok: controller.calibrated, detail: controller.calibrated ? "custom" : "default zone")
            if let e = controller.lastError { Text(e).font(.caption).foregroundStyle(.red) }
            Divider()
            Button("Calibrate…") { controller.startCalibration(); openWindow(id: "calibration") }
            if controller.calibrated { Button("Reset calibration") { controller.resetCalibration() } }
            if !controller.accessibilityOK {
                Button("Open Accessibility settings") {
                    NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
                }
            }
            Divider()
            Button("Quit Airwisp") { controller.stop(); NSApp.terminate(nil) }
        }
        .padding(12)
        .frame(width: 300)
    }
}

struct StatusRow: View {
    let label: String; let ok: Bool; let detail: String
    var body: some View {
        HStack {
            Circle().fill(ok ? Color.green : Color.orange).frame(width: 8, height: 8)
            Text(label).fontWeight(.medium)
            Spacer()
            Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
    }
}

struct CalibrationView: View {
    @ObservedObject var controller: Controller
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 16) {
            if let p = controller.calibrationPrompt {
                Image(systemName: "hand.point.up.left").font(.system(size: 40))
                Text(p).font(.title3).multilineTextAlignment(.center)
                Button("Cancel") { controller.cancelCalibration(); dismiss() }
            } else {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 40)).foregroundStyle(.green)
                Text("Calibration saved").font(.title3)
                Button("Done") { dismiss() }
            }
        }
        .padding(28)
        .frame(width: 380)
    }
}
