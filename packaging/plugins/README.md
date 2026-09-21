# Reviewed embedded plugin archives

This directory is the repository-owned input plane for plugin archives embedded
in Desktop releases. Every retained archive must have an exact name, version,
target Profile, and SHA-512 integrity in a committed packaging manifest.

`dsh-offline-plugin-installer-0.2.0.tgz` is the native Desktop installer pinned
by `../native-upstream.json`. Its source and npm lock live under
`../../plugins/dsh-offline-plugin-installer/`. Desktop checks rebuild the
package and require this archive to match byte-for-byte; runtime staging refuses
a missing, non-reproducible, or integrity-mismatched file.

`dsh-offline-plugin-installer-0.1.3.tgz` and its pin in
`../runtime-manifest.json` are retained for the historical Desktop 0.2.3 build.
The current source gate reproduces the native manifest's archive.
