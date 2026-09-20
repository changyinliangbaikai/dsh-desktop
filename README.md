# Harness Desktop Intranet

[中文](README.zh-CN.md)

This branch builds the **native DeepSeek Harness Electron desktop application**, pinned to **0.1.6-alpha.2**, commit `ddefc45fbc7f8e46dd73185e68295696d1297887`. Dsh-Desktop owns the build orchestration and intranet packaging defaults. It no longer packages its legacy Electron shell.

The downstream release version is **0.3.0-native.1**. The application and its Harness runtime retain the identical upstream version **0.1.6-alpha.2**. This is an unsigned Windows x64 pilot release, installed separately as **Harness Desktop Intranet**.

## Intranet defaults

- The DeepSeek Web Search provider is disabled. The `standard`, `ptc`, and `cordis` agent presets explicitly set `tool-web.config.search: false`; `minimal` already has no web tools. New sessions do not advertise `web_search`.
- `web_fetch`, the model endpoint, native permissions, plugin management and Office capabilities retain their upstream behavior. Disabling search is a default configuration, not a network sandbox. User-authored presets and profile overrides remain possible.
- Automatic update feeds and the public mandatory-update policy are omitted from package metadata. Install future pilot versions manually from this repository's GitHub Releases.
- The previous shell's tray behavior and offline-installer bootstrap are not included. Native Desktop owns lifecycle and plugins. The old offline installer targets Harness 0.1.2-rc.1 and has not been qualified against this runtime; do not install its legacy archive into the new client.
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

`native:stage` invokes upstream's native preparation pipeline. `native:overlay` changes only four generated YAML resources, records their before/after hashes, rejects any other runtime-file change, and regenerates/verifies the native runtime inventory. No upstream source or published npm package is patched. The native builder factory supplies the installer, shell and runtime packaging behavior.

The `Windows package` workflow builds on Windows and verifies the final ASAR, byte identity of the native shell, isolated Host startup, Web page, and actual tool registries for all four shipped presets without a model API call. A matching `desktop-v0.3.0-native.1` tag publishes a GitHub prerelease only after all gates pass. A manual workflow run stores an Actions artifact; selecting `publish` additionally creates the versioned prerelease from that exact commit after verification. Release files include the EXE, SHA256SUMS.txt, configuration deltas and build evidence. Unsigned packages have no update YAML or production signature claim.

## Validation and scope

`pnpm run check` retains the legacy shell and offline-plugin regression gates and adds the intranet configuration tests. Their success does not establish compatibility of the old plugin with native Desktop. The Windows workflow separately builds and tests the native package. Interactive installation, renderer appearance, model connectivity to the customer's intranet and Windows endpoint-security acceptance still require user testing.

This is a candidate native stack; it does not advance the integration workspace's accepted plugin-stack lock. See [native architecture](docs/native-desktop.md) and [legacy shell history](docs/legacy-shell.md).
