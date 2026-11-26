# Reviewed embedded plugin archives

This directory is the repository-owned input plane for plugin archives embedded
in Desktop releases. Every retained archive must have an exact name, version,
target Profile, and SHA-512 integrity in a committed packaging manifest.

`dsh-offline-plugin-installer-0.10.0.tgz` is pinned by the Windows and Linux
manifests. Its source and npm lock live under
`../../plugins/dsh-offline-plugin-installer/`. Both packaging gates require a
byte-for-byte match against the reviewed archive.

Linux also retains `dsh-offline-plugin-installer-0.9.0.tgz` at the path required
to upgrade an existing Profile. Its source and npm lock can be reproduced
using the plugin's `compat/dsh-v0.2.1-rc.3/` inputs.

`dsh-offline-plugin-installer-0.1.3.tgz` and its pin in
`../runtime-manifest.json` are retained for the historical Desktop 0.2.3 build.
The current source gate reproduces the native manifest's archive.
