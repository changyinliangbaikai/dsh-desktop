# AGENTS.md

This directory is the independently buildable `dsh-offline-plugin-installer` package embedded and released by Harness Desktop. It shares the Desktop Git history and release, while remaining a DSH Host/Web plugin rather than Electron code. The Desktop `../../AGENTS.md` and integration-workspace `../../../AGENTS.md` also apply.

## Product boundary

- The plugin owns offline archive validation, bounded profile-local archive storage, the explicit Web installation flow, the official DSH CLI subprocess, and its Plugins settings tab.
- DeepSeek Harness owns profile initialization, package resolution, bundle reconciliation, Cordis loading, and plugin activation. Invoke its published CLI behavior; do not copy its reconciliation implementation.
- Harness Desktop may embed and seed this plugin, but it must not reimplement archive validation or the installation page.
- An installed plugin becomes active only after the Profile restarts. Never claim that a successful package-manager exit hot-loaded code.

## Security and lifecycle

- Keep the mutation route loopback-only, same-origin, and protected by an unguessable per-process token.
- Accept only bounded npm `.tgz` bodies. Validate gzip/tar structure, paths, manifest fields, DSH bundle metadata, compatibility peers, entry count, and expanded bytes before invoking package management.
- Always install with network access disabled and lifecycle scripts disabled. Uploaded package code is trusted only after the user explicitly starts installation and restarts the Profile.
- Store accepted archives only inside the resolved Profile directory. Use generated names, never user-supplied filesystem paths.
- One installation may run at a time. Cancellation, timeout, failed initialization, and plugin unload must terminate owned subprocess trees and remove uncommitted archives.
- Bound retained archives and captured subprocess output. Never return secrets or machine-specific absolute paths to the browser.

## Package and testing rules

- Keep strict TypeScript and ESM, separate Host, archive, process, HTTP, and Web client modules, and use only published DSH/Cordis exports at the exact supported versions.
- Package built Host/Web entries, declarations, source maps, `cordis.patch.yml`, README, license, and security/development/verification documentation in the Desktop-reviewed archive.
- Keep this package independently versioned with its own `package.json` and npm lock. Do not consume Desktop dependencies, import Electron code, or rely on dependency hoisting.
- A Desktop release may embed this package only when the committed archive is byte-for-byte reproducible from this source and its SHA-512 matches the Desktop runtime manifest.
- Every behavior change updates tests and user-facing documentation. Run focused tests while developing and `npm run check` before handoff.
- `npm run check` must cover type checking, behavior, coverage, built entry points, packed contents, and the keyless user-visible snapshot.
- Acceptance uses the packed archive in a fresh isolated DSH Profile. Separate source, packed-package, assembled Host/Web, desktop staging, and manual restart evidence.

## Repository hygiene

- Do not commit `node_modules/`, `lib/`, coverage, output, archives, isolated DSH homes, logs, temporary uploads, or secrets.
- Inspect `git status` before edits and before commits. Preserve unrelated work. Do not commit, tag, publish, or push unless explicitly requested.
