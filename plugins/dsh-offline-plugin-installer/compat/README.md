# Compatibility builds

The package at the plugin root builds the 0.9.0 archive used by the published Windows snapshot. The Linux build for Harness `0.2.3-alpha.2` uses installer 0.10.0. Its source changes and independent npm lock are in `dsh-v0.2.3-alpha.2/`.

From the plugin root, prepare a fresh package directory and use its own dependency graph.

```sh
node scripts/materialize-variant.mjs dsh-v0.2.3-alpha.2 /path/to/new-directory
cd /path/to/new-directory
npm ci
npm run check
npm pack
```

The materializer applies the reviewed changes to a copy of the plugin. The Linux Desktop packaging gate starts from that copy, runs the package checks, and compares the generated archive byte-for-byte with the archive declared in its runtime manifest. It also reproduces the `dsh-v0.2.1-rc.3` archive from the package root and its lock. The upgrade package keeps those bytes at the existing file dependency path so the official CLI can replace the installer in an existing Profile.
