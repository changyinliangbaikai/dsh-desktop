# Harness Desktop

Windows desktop shell for the official DeepSeek Harness Web profile.

The shell starts the pinned DSH runtime on an operating-system-assigned loopback port, waits for the official ready line, and loads the unmodified DSH React UI in a hardened Electron BrowserWindow.

There is no desktop-side feature or policy fork. The official Permissions
selector exposes `workspace-write` and confirmed `danger-full-access`; the
current upstream profile selects PowerShell on Windows and Bash on POSIX. The
official plugin flow is retained and uses the bundled pnpm.

On Windows, the title-bar close button hides the client to the notification
area instead of stopping it. Click the DeepSeek whale tray icon, or choose
**打开 Harness Desktop** from its context menu, to restore the window. Right-click
the icon and choose **退出** to stop the managed DSH runtime and exit completely.

Packaged builds also carry one reviewed `dsh-offline-plugin-installer` archive.
Before the official Web Profile starts, the shell verifies that archive's
SHA-512 integrity and idempotently seeds it through the official `dsh plugin`
CLI. The resulting **Settings → Plugins → Offline install** page remains
plugin-owned; Desktop owns only immutable staging and first-run installation.
The independently buildable plugin source lives at
`plugins/dsh-offline-plugin-installer/` in this repository, and the Desktop
gate must reproduce the committed archive byte-for-byte from that source.

## Harness 0.1.2-rc.1 compatibility

Desktop `0.2.3` replaces the embedded `0.1.2-alpha.2` runtime with the exact `0.1.2-rc.1` release and seeds offline installer `0.1.3`. Existing Profile data and installer archive metadata need no migration.

This upstream transition is intentionally breaking for old plugin archives: packages that still declare exact `0.1.2-alpha.2` DSH peers are rejected by the new runtime and offline installer. Rebuild or upgrade those plugins against `0.1.2-rc.1` before installing them. The Electron lifecycle, ready-URL contract, Profile location, and bootstrap flow are unchanged.

## Pinned upstream

- DeepSeek Harness release: 0.1.2-rc.1
- Git tag: dsh-v0.1.2-rc.1
- Commit: a66e4702047846cdaa10c66c9d3df3951f5ea70d
- Node: ^22.19.0 or >=24.0.0
- pnpm: 11.7.0

## Development

Build the sibling DeepSeek Harness checkout first:

~~~sh
cd ../deepseek-harness
corepack pnpm@11.7.0 install --frozen-lockfile
corepack pnpm@11.7.0 run build
~~~

Then install and start the desktop shell:

~~~sh
npm --prefix plugins/dsh-offline-plugin-installer ci
corepack pnpm@11.7.0 install
corepack pnpm@11.7.0 run check
corepack pnpm@11.7.0 run start
~~~

The development resolver expects the official checkout at ../deepseek-harness. Override individual paths when required:

- DSH_DESKTOP_NODE_PATH
- DSH_DESKTOP_ENTRY_PATH
- DSH_DESKTOP_HOME
- DSH_DESKTOP_WORKSPACE

## Windows package

The installer embeds its own locked Node, official DSH, and pnpm runtime. On a
Windows x64 build host running Node 24.19.0:

~~~powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm run stage:runtime
pnpm run test:staged-runtime
pnpm run pack:win
~~~

The repository carries the exact reviewed offline-installer archive under
`packaging/plugins/`, so the default GitHub and local release paths are
self-contained. `pnpm run check` and `pnpm run stage:runtime` rebuild the
in-tree plugin and require its npm tarball to be byte-for-byte identical to
that archive before packaging continues. `DSH_DESKTOP_PLUGIN_ARCHIVE_DIR`
remains an optional explicit override for testing another reviewed archive
with the same manifest integrity.

The NSIS artifact is written under `release/`. The `Windows package` workflow
runs the same sequence and uploads the installer. A tag matching the package
version publishes the validated installer, update metadata, blockmap, and
SHA-256 checksum file to GitHub Releases:

~~~sh
release_version=$(node -p "require('./package.json').version")
git tag "desktop-v${release_version}"
git push origin "desktop-v${release_version}"
~~~

The workflow rejects a tag that does not exactly match `desktop-v` plus the
`package.json` version. A manual workflow run builds only the temporary Actions
artifact and does not create a Release. When the signing secrets are configured,
electron-builder signs the installer; otherwise it is suitable only for
development and controlled pilot testing.

The embedded pnpm executable is prepended to the managed DSH process `PATH`, so
official profile plugin installation does not depend on a machine-wide pnpm.
`stage:runtime` accepts reviewed plugin inputs from
`DSH_DESKTOP_PLUGIN_ARCHIVE_DIR`, `packaging/plugins/`, or the parent
integration workspace's `.artifacts/packages/`; it rejects any archive whose
integrity differs from `packaging/runtime-manifest.json`.

Packaged executables, shortcuts, the NSIS installer, and the macOS application
use the blue DeepSeek whale asset retained under `build/`. Its source is copied
from the pinned official Harness website favicon and the generated ICO/ICNS
containers are checked by the repository gate.

## Current milestone

P0 covers runtime startup, ready-URL validation, origin-scoped browser permissions,
single-instance behavior, Windows close-to-tray behavior, status/error surfaces,
process-tree shutdown, locked runtime staging, real DSH smoke tests, and a Windows
NSIS workflow. Native Windows acceptance and production certificate signing
remain release gates.

See [architecture](docs/architecture.md) and [testing](docs/testing.md).
