# Testing

## Test levels

1. Unit tests validate ready-line parsing, origin policy, runtime layout,
   status-document escaping, Windows close-to-tray policy, window restoration,
   tray actions, and packaged tray-icon resolution.
2. Process contract tests launch a real fake Node child to validate partial output, early exit, invalid ready URLs, timeout, graceful stop, and forced stop.
3. The real-runtime smoke launches the built official DSH CLI, exchanges the credential-bearing loopback ready URL for its authority-bound browser cookie, validates the authenticated HTTP application shell, verifies exact embedded-installer seeding and its session route, exercises embedded-pnpm plugin add/remove for staged builds, and verifies shutdown without logging the launch token.
4. The in-tree plugin gate verifies its Host/Web behavior, lifecycle, coverage,
   built entries, snapshot, and packed contents. Desktop then rebuilds its npm
   archive and requires a byte-for-byte match with the committed runtime input.
5. Packaging tests verify the committed installer archive against its source
   identity and runtime manifest, inspect the DeepSeek whale PNG/ICO/ICNS
   containers, and ensure the Windows tray ICO is copied as an unpacked runtime
   resource.
6. Electron smoke tests start the packaged shell and verify that the official DSH UI becomes visible.
7. Windows native tests validate PowerShell, the official ACL Sandbox, plugin
   installation, close-to-tray and explicit-exit behavior, process cleanup,
   paths, NSIS, and upgrade.

## Local gates

~~~sh
npm --prefix plugins/dsh-offline-plugin-installer ci
pnpm run offline-plugin:check
pnpm run offline-plugin:verify
pnpm run typecheck
pnpm run lint
pnpm run test:coverage
pnpm run build
~~~

The combined command is:

~~~sh
pnpm run check
~~~

After building the sibling official checkout, run the integration seam:

~~~sh
pnpm run test:real-dsh
~~~

The distributable-runtime gate is:

~~~sh
pnpm run stage:runtime
pnpm run test:staged-runtime
pnpm run verify:staged-runtime
~~~

Staging requires the exact archive and SHA-512 integrity recorded in
`packaging/runtime-manifest.json`, and it reruns the source/archive
reproducibility gate. Supplying a tarball beside the desktop output without
passing this gate is not embedding evidence.

Coverage excludes only the Electron composition root. Behavioral logic belongs in covered modules.

## Diagnosing preview in an existing native release

Dispatch `windows-package.yml` on the native migration branch with
`diagnosePreview=true` and `publish=false`. This skips packaging and publication,
downloads the pinned `desktop-v0.3.0-native.2` installer, checks its SHA-256, and
installs the actual application with NSIS into an isolated path containing spaces.
Update the explicit release pin and digest
together when investigating another release.

The Windows diagnosis runs in a disposable runner. It verifies an external
request succeeds, blocks the application and conversion engine's outbound
traffic except loopback, and verifies the same request fails. It then starts a
fresh native Profile, calls the real Office preview RPC, opens the fixture through
the Files sidebar, checks for a preview canvas without a failure message, and
checks close/restore/quit. First-run notices and collapsed workspaces are handled
through visible UI controls. Artifacts and isolated homes stay outside the repository.

A passing result proves this fixture and application layout on the runner. It
does not prove arbitrary documents, visual fidelity, physical network disconnect,
customer security software, customer-specific NSIS behavior, or manual tray clicks. Preserve
those as separate acceptance layers; the generic Office unavailable message alone
does not identify which service, transport, or engine boundary failed.

The same job packages and tests a standalone support ZIP. Build it locally with
`pnpm run build && node scripts/package-office-diagnostics.mjs`. The output is
under the sibling `.artifacts/native-desktop/office-diagnostics` directory.
On the affected Windows PC, extract it into a writable folder, keep the client
open, and run `diagnose-office.cmd`. If automatic discovery is ambiguous or the
client is closed, select the installed executable in the file picker.

The tool runs the installed Electron in Node mode, compares Office resources to
the bundled inventory, resolves the published conversion engine, and converts
only the included fixture in a temporary directory. It requires no network,
external Node installation, or Office installation. It does not change the
application, Profile, or workspace. The resulting `diagnostic-result.json`
contains OS/component versions, relative package paths, integrity results, and
bounded error codes; it omits error messages, stacks, absolute paths, tokens,
and user documents. Engine success does not prove that the user's active Profile
exposes the Office service. Corruption or missing files should be investigated
before a repair; do not automatically delete user profiles or bypass endpoint policy.
