# Reviewed embedded plugin archives

This directory is the repository-owned input plane for plugin archives embedded
in Desktop releases. Every retained archive must have an exact name, version,
target Profile, and SHA-512 integrity in `../runtime-manifest.json`.

`dsh-offline-plugin-installer-0.1.1.tgz` is the reviewed installer package used
by Desktop 0.2.1. Runtime staging refuses a missing or mismatched file.
