# Manual tests (need your Mac, iPhone, Apple Watch)

Nothing in the apps has been compiled or run yet. Do these in order; each step unblocks the next.

## 0. Build
1. `./scripts/setup.sh` (runs `swift test` on the core, generates the Xcode project).
2. In Xcode set your Team on AirwispMac, AirwispPhone, AirwispWatch.
3. Fix any compile errors (expect a few: the apps were written without a compiler). Most likely spots: `Controller.swift` closures, `Streamer.swift` HealthKit/WCSession delegates, `AirwispApp.swift` scene types.
4. `swift test` in `Shared/AirwispCore` must pass. If a Swift test disagrees with the Python tests, the Python reference is the spec.

## 1. Mac, camera only (no Watch)
- [ ] Run AirwispMac. Menu bar icon appears. Grant Camera and Accessibility when asked (Accessibility needs the app re-launched).
- [ ] Menu shows Camera green with fps near 30.
- [ ] Hold up your hand at arm's length from the screen, index finger out: cursor follows. Moving to the edges of the frame's center box reaches all screen edges.
- [ ] Cursor is mirrored correctly (move hand right, cursor goes right). If not, flip `mirrorX` in `Mapper`.
- [ ] Jitter at rest is acceptable. Tune `OneEuro2D(minCutoff:beta:)` in `Pipeline.swift`: lower minCutoff = steadier, higher beta = less lag in fast moves.
- [ ] Camera pinch (thumb to index) clicks. Tune `camPinchDown/Up` in `Controller.init` (ratios of palm length).
- [ ] Fist held 0.6 s toggles on/off and the menu bar icon changes.
- [ ] Menu > Calibrate: point at each screen corner as prompted; afterwards corners of the screen are reachable and the center feels right. Quit and relaunch: calibration persists.

## 2. Watch connection
- [ ] iPhone: install AirwispPhone; Watch app installs. Grant Local Network, Motion, Health prompts on Watch.
- [ ] Watch: tap Start. Mac menu shows Apple Watch row green with the Watch name within a few seconds.
- [ ] Wrist-down for 60 s: still connected (workout session keeps it alive). If it drops, check HealthKit capability is enabled on the Watch target.
- [ ] Watch "Hold = pinch" button: tap = click on Mac, hold + move = drag, release drops.
- [ ] Haptics: click on Mac causes a tap on the wrist; drag start and on/off also.
- [ ] Turn Wi-Fi off on the Watch (use iPhone relay): the Watch app status says "Via iPhone" (the Mac row may stay on the last name until timeout), clicks still work. Note the added latency.

## 3. Fusion and axes
- [ ] Move hand quickly in circles: cursor feels smoother than camera-only (compare by toggling the Watch off).
- [ ] If Watch motion pulls the cursor the wrong way, flip `yawSign` / `pitchSign` on `Pipeline` (default -1, +1). Fusion degrades gracefully with wrong signs (camera dominates), so inverted feel shows up as wobble, not breakage.
- [ ] Wear the Watch on the other wrist with the crown on the other side: re-check signs.

## 4. Gesture tuning on the Watch
- [ ] Real finger-thumb tap with the Watch hand: use the sensitivity slider (0.3x-3x) until a tap clicks reliably and arm motion doesn't. Log: accel energy values are not exposed yet; if hard to tune, add a debug label to `WatchView` printing `pinch` fast/slow.
- [ ] Flip (fast forearm twist) toggles on/off, and normal typing/mousing doesn't.
- [ ] "Hold = scroll": twist forearm to scroll vertically, swing wrist for horizontal. Adjust `scrollGain` in `GestureEngine`.

## 5. Daily-use checks
- [ ] 15 minutes of use: arm fatigue, battery drain on Watch, CPU of the Mac app (Activity Monitor).
- [ ] Dim room, cluttered background, long sleeves.
- [ ] Two screens: cursor only maps to the main display (known v1 limitation).

## Report back
Note which steps fail and what the symptoms are; the most likely early failures are compile errors, wrong axis signs, and pinch thresholds.
