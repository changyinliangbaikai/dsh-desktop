# Harness Desktop Intranet

[中文](README.zh-CN.md)

This branch builds the **native DeepSeek Harness Electron desktop application**, pinned to **0.1.7-rc.2**, commit `21638c56315ae6a2b552d6091945d3144c9af32e`. Dsh-Desktop owns the build orchestration and intranet packaging defaults. It no longer packages its legacy Electron shell.

The downstream release version is **0.4.0-native.2**. The application and its Harness runtime retain the identical upstream version **0.1.7-rc.2**. This is an unsigned Windows x64 pilot release, installed separately as **Harness Desktop Intranet**.

This build pins an unreleased upstream snapshot after the 0.1.7-rc.2 tag. The product version is unchanged, but the source commit and installer filename identify this snapshot. LibreOffice Kit remains 0.1.1; a customer preview fix is not inferred from rebuilding alone.

## Intranet defaults

- The DeepSeek Web Search provider is disabled. The `standard`, `ptc`, and `cordis` agent presets explicitly set `tool-web.config.search: false`; `minimal` already has no web tools. New sessions do not advertise `web_search`.
- `web_fetch`, the model endpoint, native permissions, plugin management and Office capabilities retain their upstream behavior. Disabling search is a default configuration, not a network sandbox. User-authored presets and profile overrides remain possible.
- Product usage analytics collection is disabled through the generated Web configuration.
- Automatic update feeds and the public mandatory-update policy are omitted from package metadata. Install future pilot versions manually from this repository's GitHub Releases.
- The upstream Windows tray hides the main window on close after its one-time confirmation. Left-click restores it; the tray menu offers Open window and Exit. Exit delegates to native Host shutdown.
- Offline installer `0.3.0` is embedded as a DSH package, available in Settings → Plugins → Offline install. It uses the active Desktop Profile and bundled pnpm with network and lifecycle scripts disabled; quit through the tray and relaunch to activate installed plugins. Older installer/plugin archives targeting Harness 0.1.6-alpha.2 or earlier must be rebuilt for 0.1.7-rc.2.
- The runtime uses upstream ASAR packaging with complete Office package unpacking and LibreOffice Kit 0.1.1. No system Office installation or engine download is required.
- Windows Office conversion also requires the x64 Microsoft Visual C++ v14 Redistributable. The upstream kit does not bundle it. Prepare the [Microsoft offline runtime installer](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) before transferring the app to a clean intranet PC; install the runtime first. Hosted build runners already contain development runtimes and do not prove this prerequisite is present on a customer's Windows 10 PC.
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

## If Office preview still fails on Windows 10

Download the matching `Dsh-Office-Diagnostics-0.4.0-native.2.zip` from Releases,
extract it into a writable directory, keep the client open, and double-click
`diagnose-office.cmd`. Select the installed application if prompted, then send
back `diagnostic-result.json`. This takes up to five minutes and uses only its
bundled fixture; no customer document, network, separate Node or Office install
is required. The report distinguishes missing/corrupt resources, conversion
failures, Unicode filenames and font-cache/system-font differences.
