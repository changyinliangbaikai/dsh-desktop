# Native Desktop build boundary

The native pilot is pinned by commit, not a floating upstream branch. Its shell,
private Host and Harness packages keep upstream's exact shared version. The
downstream release tag separately versions this repository's orchestration.

The isolated upstream checkout resides under the parent `.artifacts` directory.
Both before and after preparation, overlay and packaging, Git HEAD, clean source
status and native/root versions are checked. Upstream's frozen lockfile and peer
check precede its own native preparation pipeline (build, npm pack, runtime
closure assembly, native dependency smoke, isolated Host/Web/plugin smoke).

Only generated `dsh-base/cordis.patch.yml` and the standard/ptc/cordis
`agent.cordis.yml` files change. These are deployment configuration resources:
provider disabled, `tool-web.config.search: false`, all other parsed values
preserved. YAML comments/formatting are not retained. The overlay checks exact
row counts and names, validates the entire original runtime inventory, and
rejects any extra file changes before resealing through the upstream build
helper. This is not a new DSH plugin and changes no upstream executable code.

The native electron-builder factory remains responsible for NSIS, native
installer helpers, ASAR, runtime resources, hooks and Windows packaging. Our
configuration chooses a separate application id/product name and unsigned mode,
and omits the optional mandatory-policy package metadata. No auto-update feed is
generated. Upstream source, npm tarballs and historical acceptance reports remain
unchanged.

Final verification compares ASAR's main.js against the exact native build, checks
the overlay hashes, and launches the final application executable in Node mode
against its ASAR runtime with an isolated DSH_HOME. The real Host serves HTML and
mounts every shipped preset. `web_search` must be absent from each actual tool
registry; `web_fetch` remains in the three full presets. All agents and the Host
are disposed, with timeout failure. Raw credential-bearing ready URLs never
enter retained evidence. Checksums and a machine-path-free report accompany the
installer. Windows interactive installation remains a separate manual gate.

Custom/user presets and explicit profile patches may override these defaults.
This change does not promise air-gapped operation of models or other optional
network capabilities. Old shell plugins are not migrated or silently enabled.
