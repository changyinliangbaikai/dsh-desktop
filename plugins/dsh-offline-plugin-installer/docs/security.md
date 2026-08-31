# Security

## Threat model

An uploaded plugin is untrusted bytes until the user explicitly chooses installation. A successfully installed plugin is still privileged Host code and must come from a trusted producer. This package reduces accidental and ambient installation paths; it cannot sandbox a plugin after the user restarts DSH.

## HTTP mutation controls

The plugin fails at load when `ctx.webServer.host` is not `127.0.0.1`. Each route also verifies a loopback HTTP authority, rejects cross-site fetch metadata, and requires an exact same-origin `Origin` when one is present. Installation requires a 256-bit random token generated per Host process and returned only by the trusted session route. The token is compared in constant time and never logged.

The upload endpoint accepts POST with `application/gzip`, `application/x-gzip`, or `application/octet-stream`. The advisory filename must end in `.tgz`, but it is never used on disk. The browser sends a fixed safe filename header.

## Archive controls

Compressed bytes, expanded bytes, entry count, and `package.json` bytes are independently bounded. Every tar entry must be a regular file or directory beneath `package/`; absolute paths, `..`, backslashes, NULs, duplicates, symlinks, hard links, devices, and other types are rejected. The archive is inspected without extraction.

The manifest validator requires exact compatible Cordis/DSH peers, a real Host entry, the declared bundle patch, and a Web export when applicable. Install lifecycle scripts are rejected, and the CLI still receives `--ignore-scripts` as defense in depth. `--offline` plus offline environment flags prevents network fallback.

## Filesystem and durability

`archiveStoreDir` must be relative and resolve inside the Profile. Initialization resolves real paths and rejects a symlinked store. Incoming and metadata names are generated; archive names are content hashes, and package directories are hashes of validated package names. Files are created with owner-only modes where the platform honors them.

The store retains one committed tarball per package and enforces package-count and byte ceilings. A pending sidecar supports restart recovery without guessing whether a CLI write reached the Profile manifest.

## Process and output controls

Only one CLI process may run. It has a fixed argument vector, bounded stdout/stderr tails, a deadline, request cancellation, and unload disposal. Browser errors are stable, prewritten summaries; raw CLI output remains Host-only and is never returned across the renderer boundary.

## Remaining trust and manual gates

- A trusted package publisher and distribution/signing procedure remain deployment responsibilities. SHA-256 is displayed for comparison but no signature format is imposed.
- Windows process-tree behavior requires Windows CI and native acceptance.
- A successful install does not prove that the installed plugin is safe, starts successfully after restart, or passes subjective UI review.
- The DSH Web server itself has no general authentication. This plugin therefore refuses non-loopback binding instead of offering a remote administration mode.
