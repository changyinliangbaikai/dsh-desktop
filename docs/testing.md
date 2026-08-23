# Testing

## Test levels

1. Unit tests validate ready-line parsing, origin policy, runtime layout, and status-document escaping.
2. Process contract tests launch a real fake Node child to validate partial output, early exit, invalid ready URLs, timeout, graceful stop, and forced stop.
3. The real-runtime smoke launches the built official DSH CLI, validates its HTTP application shell, exercises embedded-pnpm plugin add/remove for staged builds, and verifies shutdown.
4. Electron smoke tests start the packaged shell and verify that the official DSH UI becomes visible.
5. Windows native tests validate PowerShell, the official ACL Sandbox, plugin installation, process cleanup, paths, NSIS, and upgrade.

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

Coverage excludes only the Electron composition root. Behavioral logic belongs in covered modules.
