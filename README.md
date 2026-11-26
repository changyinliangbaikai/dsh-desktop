# Harness Desktop Intranet

[中文](README.zh-CN.md)

Windows x64 and Linux x86_64 use Harness **0.2.3-alpha.2**, tagged at upstream commit `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`. Windows **0.6.0-native.6** builds the upstream native desktop from that source. Linux **0.6.0-kylin.2** runs the official npm distribution in the downstream Electron shell. Both embed the same reviewed offline installer `0.10.0`.

The Windows build is unsigned and installed separately as **Harness Desktop Intranet**. It includes LibreOffice Kit and its Windows engine `0.2.3`. Packaging verifies the entry and engine hashes. Word preview and conversion checks are opt-in.

## Intranet defaults

- Both DeepSeek search providers (`web-search-deepseek` and the new `web-deepseek-api`) are disabled. The combined API plugin also supplies optional API fetch; the default HTTP fetch provider stays enabled. The `standard`, `ptc`, and `cordis` agent presets explicitly set `tool-web.config.search: false`; `minimal` already has no web tools. New sessions do not advertise `web_search`.
- `web_fetch`, the model endpoint, native permissions, plugin management and Office capabilities retain their upstream behavior. Disabling search is a default configuration, not a network sandbox. User-authored presets and profile overrides remain possible.
- Product usage analytics collection is disabled through the generated Web configuration.
- Automatic update feeds and the public mandatory-update policy are omitted from package metadata. Install future pilot versions manually from this repository's GitHub Releases.
- The upstream Windows tray hides the main window on close after its one-time confirmation, now displayed inside the application window. Left-click restores it; the tray menu offers Open window and Exit. Exit delegates to native Host shutdown.
- Offline installer `0.10.0` is available in **Settings → Offline install**. It uses the active Desktop Profile and bundled pnpm with network and lifecycle scripts disabled. Quit through the tray and relaunch to activate installed plugins.
- The runtime uses upstream ASAR packaging with the complete Office engine on disk. The installer supplies the converter and engine locally.
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
Rebuild older exact-peer plugin archives for Harness `0.2.3-alpha.2` and Cordis `4.2.0-alpha.1`. Existing offline-installer storage is compatible.
The alpha.2 native Host now gets pnpm from `runtime/primary-runtime/dependencies/pnpm`.
Downstream acceptance follows that layout; plugins keep using the public
`profileContext.packageManager` invocation. Custom Profiles referencing removed
`backgroundMode` subagent settings or the `DSH_TOOLS_MODE=both` value must be updated
to the current upstream schema.

## Build and release

Use a Windows x64 host with Node `24.22.3`, pnpm `11.7.0` for Desktop, Python, Visual C++ Build Tools and the Windows SDK. Upstream uses its own pnpm `11.28.5`. The GitHub workflow supplies these and builds from an independent upstream checkout under the artifact directory.

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

The current Windows build reads [native-upstream.json](packaging/native-upstream.json). `packaging/runtime-manifest.json` describes the historical shell build. See [native architecture](docs/native-desktop.md) and [legacy shell history](docs/legacy-shell.md).

## Optional Office diagnostics

Download the matching `Dsh-Office-Diagnostics-<desktop-version>.zip`,
extract it into a writable directory, keep the client open, and double-click
`diagnose-office.cmd`. Select the installed application if prompted, then send
back `diagnostic-result.json`. This takes up to five minutes and uses only its
bundled fixture; no customer document, network, separate Node or Office install
is required. The report distinguishes missing/corrupt resources, conversion
failures, Unicode filenames and font-cache/system-font differences.

Harness `0.2.3-alpha.2` uses Cordis `4.2.0-alpha.1` and Schemastery `3.20.0-alpha.1`. The installer has an independent npm lock. Its Web settings page uses the public `settings.section` contribution. Custom Host routes should declare their authentication requirements through the WebServer API. Installation uses the official package-operation API with exact Harness and Cordis peer checks.

Since alpha.4 the standalone slots package is absent from the native runtime. The
offline installer now keeps `dsh-client-ui-slots` as a type-only development
dependency; its built entries do not import it. Mandatory runtime peer integrity
checks remain unchanged. The original renderer continues supplying the slots service.


The unsigned build now follows upstream's `build --profile local` and
`pack-local-packages.ts` path. The native shell, Host and bundled packages are
compiled from the unchanged pinned source; no official-release provenance is
claimed. Cache identities distinguish this local build profile.

Upstream moved `PROFILE_TEMPLATES` and `DEFAULT_PROFILE_BUNDLES` from
`dsh-app-boot` to the public `dsh-official-bundles` package. Custom integrations
must update those imports. Tool execution now belongs to executor plugins;
remove retired `tools.mode` / `DSH_TOOLS_MODE` overrides and follow the current
native/PTC preset configuration. The offline installer continues to use public
package operations and does not implement these upstream behaviors.


Web index injections now require the verified request Peer. Custom Web carriers
must propagate that context to `renderIndex` / `collectIndexInjections`. Desktop
acceptance verifies client discovery in the actual authenticated HTTP HTML,
letting the native server supply its own admission context.

Harness and the installer require Node `^24.22.3 || >=26.13.1`. Windows carries its own runtime, and packaging checks the actual Electron Node version.

## Kylin V10 Linux x86_64

`Harness-Desktop-0.6.0-kylin.2-linux-x86_64.deb` targets the x86_64 edition of Kylin Desktop V10 SP1 with glibc 2.31. To upgrade from kylin.1, close Harness Desktop and install the new file. Launch **Harness Desktop** from the system menu or run `harness-desktop`.

```sh
sudo apt install ./Harness-Desktop-0.6.0-kylin.2-linux-x86_64.deb
```

The `.deb` includes Electron, Node.js, pnpm, the published `@deepseek-ai/dsh@0.2.3-alpha.2` runtime, and offline installer `0.10.0`. The app starts an authenticated loopback Web profile and uses the existing `dsh-home` under its Electron user data directory. The offline installer appears in **Settings → Offline install** using Alpha 2's public settings section and Web route authentication. Rebuild archives declaring exact peers for an earlier Harness release before installing them on Alpha 2. Close the window to stop the Host and reopen the app to activate newly installed plugins.

On the first launch after upgrading from kylin.1, the official CLI updates the embedded installer in the existing Profile. The package retains the reviewed `0.9.0` archive at the path that the Profile's previous file dependency references during this update.

Build on Linux x86_64 with Node.js `24.22.3`, pnpm `11.7.0`, and the distro's native build tools. Run these commands from the Desktop repository.

```sh
pnpm install --frozen-lockfile
pnpm run pack:linux
pnpm run test:linux-runtime
```

The Linux manifest and frozen runtime lock are under `packaging/linux-x64/`. Linux packaging reproduces the current shared installer and the archive needed for upgrades. The staged runtime and installer are written to `.artifacts/linux-desktop/`. [Archive provenance](plugins/dsh-offline-plugin-installer/compat/README.md)

On GitHub, **Actions → Linux package** builds on pushes and pull requests using the glibc 2.31 baseline. After the packaged runtime passes its checks, the run uploads **harness-desktop-linux-x86_64** under **Artifacts** with the `.deb` and `SHA256SUMS.txt`.
