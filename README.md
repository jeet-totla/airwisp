# Airwisp

Turn a MacBook into an "air screen": the webcam finds your hand, your Apple Watch makes clicks crisp, bridges the gaps between camera frames with its gyro, and taps your wrist (haptics) when you click.

No one ships this exact combo (WowMouse is Watch-only; Pawvis and Airpoint are camera-only). Everything runs on-device.

## Status
Written on Linux in one session. The core logic is **tested** (Python reference, 27 tests; Swift mirror has matching XCTests). The Mac, Watch and iPhone apps are **written but never compiled or run**; expect some compile fixes on first build and tuning of thresholds. See `docs/MANUAL_TESTS.md`.

## Layout
- `prototype/` Python reference + simulator + tests (runs anywhere)
- `Shared/AirwispCore/` Swift package: protocol, One-Euro filter, mapper + calibration, fusion, gesture state machine, detectors
- `Mac/AirwispMac/` menu bar app: AVFoundation + Vision hand pose, CGEvent injection, Bonjour/UDP listener, calibration
- `Watch/AirwispWatch/` watchOS app: CoreMotion, pinch and flip detection, haptics, UDP, WatchConnectivity fallback
- `Watch/AirwispPhone/` iPhone companion that relays Watch to Mac when direct Wi-Fi fails
- `docs/ARCHITECTURE.md` design and wire protocol

## Run
```
./scripts/setup.sh      # on your Mac: tests, generate project, open Xcode
```
Then set your Apple team on all three targets, run `AirwispMac`, run `AirwispPhone` on your iPhone (installs the Watch app), open Airwisp on the Watch and tap Start.

## Gestures
| Gesture | Action |
|---|---|
| Point index finger | move cursor |
| Pinch (tap thumb + finger) | click |
| Pinch and hold, move | drag |
| "Hold = scroll" on Watch, twist forearm / swing wrist | scroll |
| Fast forearm flip | toggle on/off |
| Fist held 0.6 s (camera) | toggle on/off |

## Known limitations (v1)
- Pinch detection from Watch IMU is a heuristic; needs on-device tuning (sensitivity slider provided). The Watch's "Hold = pinch" button is the reliable fallback.
- Watch-only pinch is a tap (no drag by finger alone); drag works with camera pinch or the hold button.
- Right click and camera-assisted drag are backlog.
