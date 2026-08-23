# Harness Desktop

Windows desktop shell for the official DeepSeek Harness Web profile.

The shell starts the pinned DSH runtime on an operating-system-assigned loopback port, waits for the official ready line, and loads the unmodified DSH React UI in a hardened Electron BrowserWindow.

There is no desktop-side feature or policy fork. The official Permissions
selector exposes `workspace-write` and confirmed `danger-full-access`; the
current upstream profile selects PowerShell on Windows and Bash on POSIX. The
official plugin flow is retained and uses the bundled pnpm.

## Pinned upstream

- DeepSeek Harness release: 0.1.1-rc.2
- Git tag: dsh-v0.1.1-rc.2
- Commit: b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
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

## Current milestone

P0 covers runtime startup, ready-URL validation, origin-scoped browser permissions,
single-instance behavior, status/error surfaces, process-tree shutdown, locked
runtime staging, real DSH smoke tests, and a Windows NSIS workflow. Native
Windows acceptance and production certificate signing remain release gates.

See [architecture](docs/architecture.md) and [testing](docs/testing.md).
