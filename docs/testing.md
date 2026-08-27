# Testing

## Test levels

1. Unit tests validate ready-line parsing, origin policy, runtime layout, and status-document escaping.
2. Process contract tests launch a real fake Node child to validate partial output, early exit, invalid ready URLs, timeout, graceful stop, and forced stop.
3. The real-runtime smoke launches the built official DSH CLI, validates its HTTP application shell, verifies exact embedded-installer seeding and its session route, exercises embedded-pnpm plugin add/remove for staged builds, and verifies shutdown.
4. Packaging tests verify the committed installer archive against the runtime manifest and inspect the DeepSeek whale PNG/ICO/ICNS containers and electron-builder wiring.
5. Electron smoke tests start the packaged shell and verify that the official DSH UI becomes visible.
6. Windows native tests validate PowerShell, the official ACL Sandbox, plugin installation, process cleanup, paths, NSIS, and upgrade.

## Local gates

~~~sh
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
`packaging/runtime-manifest.json`. Supplying a tarball beside the desktop output
without passing this gate is not embedding evidence.

Coverage excludes only the Electron composition root. Behavioral logic belongs in covered modules.
