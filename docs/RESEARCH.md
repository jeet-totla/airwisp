# What similar projects teach us

Read 2026-11-01. Findings come from READMEs and pages, not full source reads, unless noted.

## Projects reviewed
| Project | What it is | Takeaways for Airwisp |
|---|---|---|
| [rachts/Air-Mouse](https://github.com/rachts/Air-Mouse) | Python + MediaPipe virtual mouse (source of `gestures.py` / `cursor_controller.py` read) | Active box x 0.15-0.85, y 0.15-0.75 (ours: 0.2-0.8 / 0.25-0.75). Plain EMA alpha 0.2. Pinch = fixed 0.05 distance, **not scaled by hand size and no hysteresis**: pinch breaks at different distances from the camera and flickers at the threshold. We already normalize by palm length and use two thresholds. |
| [L-ubu/Skeleton_Engine](https://github.com/L-ubu/Skeleton_Engine) | macOS gesture-to-action engine | Per-gesture **dwell** (~300 ms) and **cooldown** (~500 ms) kill false triggers. Global hotkey toggle (Cmd+Shift+G) for on/off. Runs detection on every 2nd frame (~45 fps). Middle-finger tap = right click; peace sign + vertical motion = scroll. Hot-reloaded config. |
| [Gstrl](https://tomyang-tz.github.io/Gstrl) | Swift: AVCaptureSession + Vision hand pose + CGEvent | Same stack as ours, so the architecture is sound. Uses one hand to move and the other to click, which avoids click-induced cursor movement. Held pinch ~1 s = right click. Velocity-based swipes. |
| [reynaldichernando/pinch](https://github.com/reynaldichernando/pinch) and [write-up](https://www.gigazine.net/gsc_news/en/20241124-selfmade-apple-vision-pro-interface) | Tauri + MediaPipe, Vision-Pro-style pinch mouse | Fingertip distance changes with distance from the camera, so normalize. **Cursor drifts while pinching**: we already freeze the cursor at the pinch anchor. Moving-average smoothing trades jitter for lag; One Euro filter fixes the trade-off (we use it). Linear mapping so the cursor reaches screen edges with the hand inside the frame (ours). OpenCV `waitKey` added big latency: stay on native capture. |
| [Doublepoint WowMouse](https://skarredghost.com/2024/06/27/doublepoint-wowmouse-smartwatch-xr/) and [touch-sdk-py](https://github.com/doublepointlab/touch-sdk-py) | Watch pinch detection by ML on wrist IMU | Pinch = thumb-finger contact vibration in the wrist sensors, classified by an ML model; processing is local; weak pinches are missed; wrist orientation gives 3-DOF pointing. Their SDK reports a gesture **probability** (not just a yes/no), plus hand (left/right), IMU, orientation and haptics. Our threshold detector is a stand-in for that model. |

## Watch keep-alive: what Apple says
- `HKWorkoutSession` is for workouts. Apple's engineer: pick the session type that matches what the app does.
- `WKExtendedRuntimeSession` types: self care (10 min, frontmost), mindfulness (1 h, frontmost), physical therapy (1 h, background), smart alarm (30 min, background). Heavy CPU can get the session cancelled. ([docs](https://developer.apple.com/documentation/watchkit/using-extended-runtime-sessions))
- Decision: Airwisp now uses the physical-therapy runtime session (1 hour, **no Health permission or entitlement**). Restart it with the Start button each hour. Reasonable for personal use; App Store review would need a different justification.

## Backlog from this research (not built yet)
1. Dwell + cooldown on discrete gestures (fist toggle already has dwell).
2. Global keyboard shortcut to toggle on/off (needs a hotkey library or `NSEvent` monitor).
3. Pinch **probability** instead of a hard threshold; record real Watch data and train a small classifier (the long-term way to match Doublepoint).
4. Middle-finger + thumb pinch (camera) = right click.
5. Run Vision on every 2nd frame if CPU is high.
6. Optional two-hand mode: one hand moves, the other clicks.
7. Free-account note: provisioning lasts about 7 days and App ID changes are capped (10 per week, per an older Apple-developer write-up), so re-run from Xcode weekly.
