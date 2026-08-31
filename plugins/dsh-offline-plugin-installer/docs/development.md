# Development

## Repository loop

Use this package's npm lockfile; do not rely on Desktop's `node_modules`, sibling
packages, or source from the pinned Harness checkout.

```sh
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run test:snapshot
npm run test:built
```

The Host bundle keeps published DSH/Cordis services external and bundles the tar parser so the released installer has no runtime npm dependencies of its own. The browser bundle uses the DSH lazy-CJS module wrapper and leaves only React runtime imports external.

Focused tests should cover the changed module first. Archive changes need valid and hostile tar fixtures. Process changes need success, failure, timeout, cancellation, unload, and output-bound cases. Browser changes need component behavior, client response parsing, tab registration, and the reviewed copy snapshot. Packaging changes need a built-entry import and `npm pack --dry-run` contents check.

## Assembled Profile loop

Build and pack the plugin, then use the exact archive rather than a source link:

```sh
npm run check
npm pack
dsh plugin --profile web add ./dsh-offline-plugin-installer-0.1.2.tgz
```

Run against a disposable `DSH_HOME`. Confirm resolved config contains the package row and the Web boot manifest includes its client. Open Settings → Plugins → Offline install, install a separate known-good fixture package, restart the Profile, and verify the fixture's Host/Web surfaces. Also exercise a missing offline dependency, bad peer version, oversized archive, cancellation, timeout, and clean shutdown.

Never retain real user packages, profile paths, tokens, or raw Host logs as repository evidence.

From the Desktop repository root, `pnpm run offline-plugin:check` runs this
package gate and `pnpm run offline-plugin:verify` rebuilds the npm archive and
compares it byte-for-byte with the reviewed Desktop bootstrap input.
