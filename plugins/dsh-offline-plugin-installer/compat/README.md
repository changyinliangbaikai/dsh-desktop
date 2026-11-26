# Compatibility builds

The plugin root builds installer `0.10.0` for Harness `0.2.3-alpha.2` on Windows and Linux. The previously published `0.9.0` source changes and independent npm lock are retained under `dsh-v0.2.1-rc.3/`.

From the plugin root, prepare a fresh package directory and use its own dependency graph.

```sh
node scripts/materialize-variant.mjs dsh-v0.2.1-rc.3 /path/to/new-directory
cd /path/to/new-directory
npm ci
npm run check
npm pack
```

Desktop checks reproduce the current archive from the plugin root and its npm lock. The Linux packaging gate also materializes and reproduces `0.9.0`. The Linux installer keeps those bytes at the existing file dependency path so the official CLI can update an older Profile.
