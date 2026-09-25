# Harness Desktop Intranet

[中文](README.zh-CN.md)

This branch builds the **native DeepSeek Harness Electron desktop application**, pinned to **0.1.7-rc.2**, commit `477b4f420553e8a52c2fbccc464d7561b239c443`. Dsh-Desktop owns the build orchestration and intranet packaging defaults. It no longer packages its legacy Electron shell.

The downstream release version is **0.4.0-native.1**. The application and its Harness runtime retain the identical upstream version **0.1.7-rc.2**. This is an unsigned Windows x64 pilot release, installed separately as **Harness Desktop Intranet**.

## Intranet defaults

- The DeepSeek Web Search provider is disabled. The `standard`, `ptc`, and `cordis` agent presets explicitly set `tool-web.config.search: false`; `minimal` already has no web tools. New sessions do not advertise `web_search`.
- `web_fetch`, the model endpoint, native permissions, plugin management and Office capabilities retain their upstream behavior. Disabling search is a default configuration, not a network sandbox. User-authored presets and profile overrides remain possible.
- Automatic update feeds and the public mandatory-update policy are omitted from package metadata. Install future pilot versions manually from this repository's GitHub Releases.
- The upstream Windows tray hides the main window on close after its one-time confirmation. Left-click restores it; the tray menu offers Open window and Exit. Exit delegates to native Host shutdown.
- Offline installer `0.3.0` is embedded as a DSH package, available in Settings → Plugins → Offline install. It uses the active Desktop Profile and bundled pnpm with network and lifecycle scripts disabled; quit through the tray and relaunch to activate installed plugins. Older installer/plugin archives targeting Harness 0.1.6-alpha.2 or earlier must be rebuilt for 0.1.7-rc.2.
- The runtime uses upstream ASAR packaging with complete Office package unpacking and LibreOffice Kit 0.1.1. No system Office installation or engine download is required.
- Native Desktop uses `$DSH_HOME/profiles/desktop`. It may share supported Harness user data with the CLI. Back up existing data before testing a newer Harness generation; downgrades of session formats are not promised.

## Build and release

Use a Windows x64 host with Node 24, pnpm 11.7.0, Python, Visual C++ Build Tools and Windows SDK. The GitHub workflow supplies these. Both repositories are independently checked out; all upstream outputs go into the integration artifact plane:

```text
<workspace>/Dsh-Desktop/
<workspace>/.artifacts/native-desktop/upstream/  # exact pinned upstream checkout
<workspace>/.artifacts/native-desktop/release/ # installer and evidence
```

From Dsh-Desktop:

```powershell
pnpm install --frozen-lockfile
npm --prefix plugins/dsh-offline-plugin-installer ci
pnpm run check
pnpm --dir ../.artifacts/native-desktop/upstream install --frozen-lockfile
pnpm --dir ../.artifacts/native-desktop/upstream peers check
pnpm run native:stage
pnpm run native:overlay
pnpm run pack:win
pnpm run native:verify
```

`native:stage` invokes upstream's native preparation. `native:overlay` configures search, embeds the byte-reproduced offline package, adds its Web bundle row and reseals the runtime. Existing upstream executable bytes remain unchanged. The original native entry now owns the tray; the previous downstream tray entry is not shipped. Packaging restores the sealed runtime after dependency metadata cleanup.

The Windows workflow checks all final runtime files, native main.js and the upstream tray icon. It starts the final executable against the real runtime, runs upstream DOCX/XLSX/PPTX and standalone Office CLI acceptance, verifies authenticated offline-install routes and client discovery, installs a fixture archive with bundled pnpm, and verifies activation after restart. A matching version tag or manual `publish` run publishes only after these gates pass.

## Validation and scope

`pnpm run check` includes plugin type/behavior/coverage/packed tests, byte reproduction, and Desktop regression tests. Final Windows runtime checks are separate. Interactive tray clicks, window appearance, installation/uninstall, and customer intranet model connectivity still require user testing. Search defaults remain overridable by explicit Profile patches. Plugin archives with uncached external dependencies fail offline; installation success requires a restart, not just closing the window to the tray.

This is a candidate native stack; it does not advance the integration workspace's accepted plugin-stack lock. See [native architecture](docs/native-desktop.md) and [legacy shell history](docs/legacy-shell.md).
