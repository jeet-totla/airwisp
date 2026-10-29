# Airwisp architecture

Goal: turn a MacBook into an "air screen". Webcam gives absolute hand position, Apple Watch gives crisp clicks, fast motion (gyro) and haptic feedback.

## Components

```
Apple Watch (watchOS)                     MacBook (macOS)
 CoreMotion 100Hz  ──┐                     ┌── AVFoundation webcam 30fps
 pinch detector      ├─ UDP over Wi-Fi ──► │   Vision VNDetectHumanHandPoseRequest
 haptics  ◄──────────┘  (Bonjour found)    │        │ index tip + thumb tip (normalized)
   ▲   fallback: WatchConnectivity→iPhone  │        ▼
   │                                       │   Fusion (AirwispCore)
   └── haptic cmds (UDP back) ◄────────────┤   OneEuro → Mapper(active zone, calib)
                                           │   GestureEngine (state machine)
                                           ▼
                                      CGEvent injection (move/click/drag/scroll)
```

## Data flow

1. Camera: index fingertip (x,y) in [0,1], confidence, 30 Hz.
2. Watch: gyro rate (rad/s, 3 axes) + accel at 100 Hz, plus discrete events (pinch, release, double-pinch, flip).
3. Fusion: complementary filter. Between camera frames, cursor is advanced by gyro-derived delta (scaled by a gain learned online); each camera frame pulls the estimate back toward absolute position (alpha ~0.2-0.35). Result: camera sets where, gyro sets how it feels between frames.
4. Mapper: active zone (central box of the frame, mirrored in x) mapped to full screen with optional 4-corner calibration (bilinear).
5. One-Euro filter on the final point: low jitter at rest, low lag on fast moves.
6. GestureEngine:
   - Enabled/disabled toggle: Watch palm-flip or fist hold 0.6s (camera) toggles `armed`. Disarmed = no events.
   - Pinch down from Watch (primary) or camera thumb-index distance (fallback, hysteresis) → mouseDown after a 120ms hold window; short pinch = click, hold+move = drag.
   - Double-pinch = right click.
   - Scroll: while two-finger "scroll mode" (watch crown-less: wrist roll rate while palm sideways) → scroll deltas.
7. Haptics: click → `.click`, hover over clickable region unsupported in v1, drag start → `.start`, disarm → `.stop`.

## Wire protocol (UDP, little-endian, 1 packet = 1 message)

Header: magic `0xA5`, type u8, seq u16, t_ms u32 (watch monotonic).
- 0x01 IMU: gx gy gz ax ay az (6×f32)
- 0x02 EVENT: code u8 (1 pinch_down, 2 pinch_up, 3 double_pinch, 4 flip, 5 scroll_start, 6 scroll_end)
- 0x03 HELLO: device name utf8
- 0x10 HAPTIC (Mac→Watch): kind u8
JSON mirror exists for debugging and the WatchConnectivity fallback.

## Latency budget
Watch→Mac UDP over same Wi-Fi: ~5-15 ms. Camera→cursor: ~35-60 ms (frame + Vision). Gyro bridges the gap between camera frames. Fallback via iPhone adds ~30-80 ms.

## Privacy
All processing on-device. No camera frames leave the Mac; no network beyond local LAN.

## Modules
- `prototype/` Python reference of all core logic, tested here
- `Shared/AirwispCore` Swift package: same logic, XCTest mirrors
- `Mac/` SwiftUI menu bar app
- `Watch/` watchOS app + iOS relay companion
