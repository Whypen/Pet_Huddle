# Checks Log

This file records repeated verification runs across both the web UI (`src/`) and the Expo mobile app (`mobile/`).

## 2026-02-08T07:10:40Z

Web (repo root):
- `npm run lint` (pass with warnings only, exit code 0)
- `npm run build` (pass)
- `npm test` (pass)

Mobile (`mobile/`):
- `npm run lint` (pass)
- `npm run typecheck` (pass)

Native builds (mobile):
- iOS simulator: `xcodebuild -workspace ios/mobile.xcworkspace -scheme mobile ... build` (pass)
- Android: `mobile/android/./gradlew :app:assembleDebug` (pass)

