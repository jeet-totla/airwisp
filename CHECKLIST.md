# Airwisp build checklist

Started 2026-10-29 03:23 ET. Hard stop 07:20 ET (budget: 4h). Resumes via scheduled task every ~35 min.
Environment is Linux: Swift/Xcode code is written but NOT compiled here. Manual tests are last.

## Phase 0: Scaffold
- [x] README.md
- [x] docs/ARCHITECTURE.md

## Phase 1+2: Core logic (Python reference, runs + tested here)
- [x] protocol (message schema, JSON + compact binary)
- [x] One-Euro filter
- [x] Active-zone mapper + 4-corner calibration (homography-free affine/bilinear)
- [x] Gyro/camera complementary fusion
- [x] Gesture state machine (on/off, point, click, drag, scroll)
- [x] Simulator and pytest suite passing (24 tests; fused error ~0.026 vs camera-only ~0.098 in sim)

## Phase 3: Swift shared package (AirwispCore)
- [x] Port protocol, OneEuro, Mapper, Fusion, GestureEngine, Pipeline (uncompiled)
- [x] XCTest mirrors of Python tests (uncompiled)

## Phase 4: Mac app
- [x] Camera capture + Vision hand pose (uncompiled)
- [x] CGEvent cursor injection (uncompiled)
- [x] Network listener (Bonjour + UDP) (uncompiled)
- [x] Menu bar UI, calibration flow, permissions (uncompiled)

## Phase 5: Watch + iPhone
- [x] CoreMotion streaming, pinch + flip detection, haptics (uncompiled; detectors tested in Python)
- [x] UDP transport (direct) + WatchConnectivity fallback via iPhone (uncompiled)

## Phase 6: Packaging
- [x] XcodeGen project.yml, Info.plists, entitlements
- [x] Final review pass (manual read-through for compile issues; real compile is step 0 of MANUAL_TESTS)

## Phase 7: Manual tests (need Mac + Watch + webcam)
- [x] MANUAL_TESTS.md written (docs/MANUAL_TESTS.md)
