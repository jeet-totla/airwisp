#!/usr/bin/env bash
# One-shot setup on your Mac: run core tests, generate the Xcode project, open it.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== Swift core tests"
(cd Shared/AirwispCore && swift test)
echo "== Generate Xcode project"
command -v xcodegen >/dev/null || brew install xcodegen
xcodegen generate
open Airwisp.xcodeproj
echo "Next: set your Team in Signing for all 3 targets, then run AirwispMac (Mac) and AirwispPhone (iPhone, installs the Watch app). See docs/MANUAL_TESTS.md"
