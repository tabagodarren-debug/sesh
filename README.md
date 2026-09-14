# SESH

SESH is a focused desktop timer with a shareable, PNL-inspired interface. It tracks elapsed focus time, preserves daily session history, supports still and motion backgrounds, and turns completed sessions into clean cards for sharing.

## Features

- Pure count-up focus timer with a configurable benchmark percentage
- Compact and standard window modes
- Daily session calendar with streak and monthly-high tracking
- Local image and video backgrounds
- Wallhaven image browser and local cache
- Optional Wallpaper Engine image/video library integration on Windows
- Shareable still and video session cards
- Local-first persistence with no account or cloud requirement
- Keyboard-accessible controls and reduced-motion support

## Platform status

- **Windows 11:** supported and packaged as an NSIS installer
- **macOS 11+:** Apple Silicon DMG releases are built on GitHub's macOS ARM64 runner. They use ad-hoc signing until Apple Developer signing and notarization are configured; hands-on validation on Apple hardware is still required

Download published builds from the repository's [Releases](https://github.com/tabagodarren-debug/sesh/releases) page.

Wallpaper Engine integration is Windows-only and remains hidden when Wallpaper Engine is unavailable. All other core timer, calendar, appearance, local media, and sharing features are designed to remain available on macOS.

## Development

Prerequisites:

- Node.js 24+
- Rust stable
- Tauri 2 platform prerequisites for your operating system

Install dependencies and run the desktop app:

```sh
npm ci
npm run tauri dev
```

Run validation:

```sh
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:e2e
```

Build a release package:

```sh
npm run tauri build
```

On macOS, Tauri automatically merges `src-tauri/tauri.macos.conf.json`, which enables `.app` and `.dmg` bundles.

## Privacy

SESH stores settings, session history, profile media, and cached backgrounds locally. Share exports are written only when requested. The app does not upload session data.

Wallhaven searches connect to the Wallhaven API. An optional Wallhaven API key is stored locally and should never be committed.

## Contributing

Issues and pull requests are welcome. Before submitting a change, run the validation commands above and keep timer-domain logic independent from React and Tauri where practical.

## License

SESH is available under the [MIT License](LICENSE).
