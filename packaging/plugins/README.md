# Reviewed embedded plugin archives

This directory is the repository-owned input plane for plugin archives embedded
in Desktop releases. Every retained archive must have an exact name, version,
target Profile, and SHA-512 integrity in `../runtime-manifest.json`.

`dsh-offline-plugin-installer-0.1.3.tgz` is the reviewed installer package used
by Desktop 0.2.3. Its source and npm lock live under
`../../plugins/dsh-offline-plugin-installer/`. Desktop checks rebuild the
package and require this archive to match byte-for-byte; runtime staging refuses
a missing, non-reproducible, or integrity-mismatched file.
