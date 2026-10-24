# Harness Desktop Intranet

[中文](README.zh-CN.md)

This branch builds the **native DeepSeek Harness Electron desktop application**, pinned to **0.2.1-rc.3**, commit `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`. Dsh-Desktop owns the build orchestration and intranet packaging defaults. It no longer packages its legacy Electron shell.

The downstream release version is **0.6.0-native.5**. The application and its Harness runtime retain the identical upstream version **0.2.1-rc.3**. This is an unsigned Windows x64 pilot release, installed separately as **Harness Desktop Intranet**.

This build pins the latest reviewed source snapshot after `dsh-v0.2.1-rc.3` (`1f81c047fc48fa190a683e469daa699857e9afe8`). The product version remains rc.3, but the packaged source is commit `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`; it is not the published rc.3 source tag. The offline installer is rebuilt with exact 0.2.1-rc.3 peers and a freshly resolved npm lock; archives for the previous Harness version must be rebuilt before installation. The production graph resolves LibreOffice Kit 0.1.5 and Windows engine 0.1.5, with the matching published Windows payload. Packaging checks their versions and exact entry/engine hashes. The customer confirmed Word preview works after updating the client and x64 Visual C++ runtime. Subsequent builds skip that specific check by default.

## Intranet defaults

- Both DeepSeek search providers (`web-search-deepseek` and the new `web-deepseek-api`) are disabled. The combined API plugin also supplies optional API fetch; the default HTTP fetch provider stays enabled. The `standard`, `ptc`, and `cordis` agent presets explicitly set `tool-web.config.search: false`; `minimal` already has no web tools. New sessions do not advertise `web_search`.
- `web_fetch`, the model endpoint, native permissions, plugin management and Office capabilities retain their upstream behavior. Disabling search is a default configuration, not a network sandbox. User-authored presets and profile overrides remain possible.
- Product usage analytics collection is disabled through the generated Web configuration.
- Automatic update feeds and the public mandatory-update policy are omitted from package metadata. Install future pilot versions manually from this repository's GitHub Releases.
- The upstream Windows tray hides the main window on close after its one-time confirmation. Left-click restores it; the tray menu offers Open window and Exit. Exit delegates to native Host shutdown.
- Offline installer `0.9.0` is embedded as a DSH package, available in Settings → Plugins → Offline install. It uses the active Desktop Profile and bundled pnpm with network and lifecycle scripts disabled; quit through the tray and relaunch to activate installed plugins. Older installer/plugin archives targeting a different Harness version must be rebuilt for 0.2.1-rc.3.
- The runtime uses upstream ASAR packaging with complete Office package unpacking and LibreOffice Kit 0.1.5. No system Office installation or engine download is required.
- Windows Office conversion also requires the x64 Microsoft Visual C++ v14 Redistributable. The upstream kit does not bundle it. Prepare the [Microsoft offline runtime installer](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) before transferring the app to a clean intranet PC; install the runtime first. Hosted build runners already contain development runtimes and do not prove this prerequisite is present on a customer's Windows 10 PC.
- Native Desktop uses `$DSH_HOME/profiles/desktop`. It may share supported Harness user data with the CLI. Back up existing data before testing a newer Harness generation; downgrades of session formats are not promised.

The new upstream terminal launcher is included unchanged. A byte-identical
`DeepSeek Harness.exe` compatibility executable supports it while the intranet
application keeps its existing name and installation identity. CI tests the
installed `dsh.cmd --version` with outbound traffic blocked. This adds another
copy of the Electron executable to the installed payload.

Upstream 0.2.1 removes runtime invariant plugins and `./invariant` exports.
Custom profiles/extensions referencing these entries must be updated. Extensions
replacing the old input-dock `stats` row must migrate to `activity` and `usage`.
Older exact-peer plugin archives need rebuilding for Harness 0.2.1-rc.3 and
Cordis 4.0.5; no offline-installer archive-store migration is needed.
The alpha.2 native Host now gets pnpm from `runtime/primary-runtime/dependencies/pnpm`.
Downstream acceptance follows that layout; plugins keep using the public
`profileContext.packageManager` invocation. Custom Profiles referencing removed
`backgroundMode` subagent settings or the `DSH_TOOLS_MODE=both` value must be updated
to the current upstream schema.

## Build and release

Use a Windows x64 host with Node 24, pnpm 11.7.0 for Desktop (upstream owns pnpm 11.28.5), Python, Visual C++ Build Tools and Windows SDK. The GitHub workflow supplies these. Both repositories are independently checked out; all upstream outputs go into the integration artifact plane:

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

`native:stage` orchestrates the pinned upstream build and preparation commands without source changes. By default it passes upstream's supported `prepare:dsh --defer-runtime-smoke` option, because the combined upstream smoke also converts Office documents. The final payload, assembled Profile and GUI lifecycle gates still run. `native:overlay` configures search, embeds the byte-reproduced offline package, adds its Web bundle row and reseals the runtime. Existing upstream executable bytes remain unchanged. The original native entry now owns the tray; the previous downstream tray entry is not shipped. Packaging restores the sealed runtime after dependency metadata cleanup.

The Windows workflow checks all final runtime files, native main.js and the upstream tray icon. It checks the final executable and native dependency payload, verifies authenticated offline-install routes and client discovery, installs a fixture archive with bundled pnpm, and verifies activation after restart. Installed upgrade and close/restore/quit checks remain mandatory. Office conversion and Word preview are opt-in: select `validateOffice` in the workflow, or set `DSH_VALIDATE_OFFICE=1` before staging and verification. Evidence explicitly records skipped probes; the portable diagnostic ZIP is still built without running it. A matching version tag or manual `publish` run publishes only after these gates pass.

## Validation and scope

`pnpm run check` includes plugin type/behavior/coverage/packed tests, byte reproduction, and Desktop regression tests. Final Windows runtime checks are separate. Interactive tray clicks, window appearance, installation/uninstall, and customer intranet model connectivity still require user testing. Search defaults remain overridable by explicit Profile patches. Plugin archives with uncached external dependencies fail offline; installation success requires a restart, not just closing the window to the tray.

This is a candidate native stack; it does not advance the integration workspace's accepted plugin-stack lock. See [native architecture](docs/native-desktop.md) and [legacy shell history](docs/legacy-shell.md).

## Optional Office diagnostics

Download the matching `Dsh-Office-Diagnostics-0.6.0-native.5.zip` from Releases,
extract it into a writable directory, keep the client open, and double-click
`diagnose-office.cmd`. Select the installed application if prompted, then send
back `diagnostic-result.json`. This takes up to five minutes and uses only its
bundled fixture; no customer document, network, separate Node or Office install
is required. The report distinguishes missing/corrupt resources, conversion
failures, Unicode filenames and font-cache/system-font differences.

This rc.3 snapshot compatibility release uses Cordis 4.0.5 and Schemastery 3.18.5
with a freshly resolved independent plugin lock. Upstream now evaluates an explicit `engines.dsh` requirement
before fallback DSH peers. This offline installer retains its reviewed exact-peer
policy: rebuild older archives for the pinned Harness/Cordis versions. It does not
use compatibility exemptions or relax package validation. Connection's public
request admission and the official package-operation API remain the integration
boundaries; no upstream authentication or plugin-management code is copied.

Since alpha.4 the standalone slots package is absent from the native runtime. The
offline installer now keeps `dsh-client-ui-slots` as a type-only development
dependency; its built entries do not import it. Mandatory runtime peer integrity
checks remain unchanged. The original renderer continues supplying the slots service.


The unsigned build now follows upstream's `build --profile local` and
`pack-local-packages.ts` path. The native shell, Host and bundled packages are
compiled from the unchanged pinned source; no official-release provenance is
claimed. Cache identities distinguish this local build profile. A source snapshot
without its own upstream tag does not receive the earlier tag's compatibility label.

Upstream moved `PROFILE_TEMPLATES` and `DEFAULT_PROFILE_BUNDLES` from
`dsh-app-boot` to the public `dsh-official-bundles` package. Custom integrations
must update those imports. Tool execution now belongs to executor plugins;
remove retired `tools.mode` / `DSH_TOOLS_MODE` overrides and follow the current
native/PTC preset configuration. The offline installer continues to use public
package operations and does not implement these upstream behaviors.
