# Getting started (no coding experience needed)

You need: a Mac, an iPhone, a paired Apple Watch, all on the same Wi-Fi.

1. **Install Xcode** (free, Mac App Store, large download). Open it once and accept the license.
2. **Install Homebrew** (a tool installer): open Terminal and paste the one-line command from https://brew.sh.
3. **Get the project**: unzip it into Documents so you have `~/Documents/Airwisp`.
4. **Run setup**: in Terminal:
   ```
   cd ~/Documents/Airwisp
   ./scripts/setup.sh
   ```
   It tests the core, builds the Xcode project and opens it. If it prints errors, copy them and send them over.
5. **Sign in**: Xcode > Settings > Accounts > add your Apple ID. Then, for each of the three targets (AirwispMac, AirwispPhone, AirwispWatch): click it > Signing & Capabilities > pick your Team.
6. **Mac first**: top bar, choose scheme `AirwispMac` and destination `My Mac`, press Run (the play button). Allow Camera and Accessibility when asked (Accessibility: System Settings > Privacy & Security > Accessibility). Point at the screen: the cursor should follow your index finger.
7. **Then the Watch**: plug in your iPhone, choose scheme `AirwispPhone` and your iPhone as destination, Run. Open Airwisp on the Watch and tap Start.
8. Follow `docs/MANUAL_TESTS.md` and tell me what works and what doesn't.

Compile errors on the first build are expected; paste them to Claude and they get fixed.
