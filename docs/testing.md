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
