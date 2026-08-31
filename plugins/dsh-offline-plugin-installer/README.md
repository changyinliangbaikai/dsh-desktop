# dsh-offline-plugin-installer

`dsh-offline-plugin-installer` adds an **Offline install** tab to DeepSeek Harness Web Settings → Plugins. A user selects a built npm `.tgz`; the Host validates the archive, stores it inside the target Profile, and invokes the official `dsh plugin --profile … add …` path with networking and lifecycle scripts disabled. The new plugin is available after the Profile restarts.

This is an independently buildable DSH npm package whose source is retained in
the Harness Desktop repository. It shares the Desktop Git history and release,
but it does not import Electron code, patch DeepSeek Harness, or consume private
Harness source. Harness Desktop verifies, embeds, and seeds the reviewed archive
without reimplementing its behavior.

## Supported stack

- DeepSeek Harness `0.1.2-alpha.2`
- Cordis `4.0.2`
- Node `^22.19.0 || >=24.0.0`

All DSH and Cordis peer dependencies are exact. A different Harness baseline requires a new compatible plugin release and assembled-profile verification.

## Bootstrap installation

The installer itself must be present in the Profile before its page can be used. Install a reviewed release archive through the official CLI, then restart the Profile:

```sh
dsh plugin --profile web add ./dsh-offline-plugin-installer-0.1.2.tgz
```

Harness Desktop can embed and seed this one reviewed archive during runtime staging. Once present, later offline plugin packages are installed from the page without a terminal.
Desktop checks must reproduce the embedded archive byte-for-byte from this
source and match its SHA-512 runtime-manifest entry.

## Page workflow

1. Open **Settings → Plugins → Offline install**.
2. Select one built npm `.tgz` package.
3. Choose **Upload and install**.
4. Review the validated package name and version.
5. Restart the DSH Profile. In Harness Desktop, quit and reopen the application.

A successful response proves that the official package manager accepted the archive and reconciled its `dsh.bundle` layer. It does not mean the plugin was hot-loaded or that its own live/manual acceptance passed.

## Accepted package contract

The uploaded tarball must:

- use the standard npm `package/` tar root and contain one `package/package.json`;
- declare a valid lower-case npm package name, semantic version, Node engine range, Host `main`, `exports["."]`, and `dsh.bundle.patch`;
- contain the declared Host entry and patch file;
- expose `exports["./client"]` when it declares `dsh.client`;
- require Cordis `4.0.2` and every declared `@deepseek-ai/dsh-*` peer at `0.1.2-alpha.2` exactly;
- contain no absolute/traversal paths, duplicate entries, links, device entries, or `preinstall`/`install`/`postinstall` scripts;
- remain within the configured compressed bytes, expanded bytes, and entry-count ceilings.

Installation always passes `--offline --ignore-scripts --save-exact`. A self-contained plugin with no runtime dependencies is the most portable package. If `dependencies` or `optionalDependencies` are declared, matching packages must already exist in the bundled/local pnpm store; the installer never falls back to the network.

## Configuration

`cordis.patch.yml` supplies a complete default row because DSH patch replacement is not a deep merge.

| Field | Default | Purpose |
|---|---:|---|
| `profile` | `web` | Profile mutated by the official DSH CLI |
| `archiveStoreDir` | `.dsh-offline-plugin-packages` | Relative directory inside that Profile |
| `cliEntryPath` | empty | Current DSH CLI entry; set an absolute override only for a custom launcher |
| `maxUploadBytes` | 256 MiB | Compressed request ceiling |
| `maxExpandedBytes` | 512 MiB | Decompressed tar payload ceiling |
| `maxArchiveEntries` | 10,000 | Tar entry ceiling |
| `maxStoredPackages` | 128 | Maximum distinct retained package directories |
| `maxStoredBytes` | 2 GiB | Retained plus incoming archive ceiling |
| `installTimeoutMs` | 300,000 | DSH CLI deadline |
| `maxCliOutputBytes` | 65,536 | Per-stream Host-only diagnostic tail |
| `expectedHarnessVersion` | `0.1.2-alpha.2` | Exact accepted DSH peer version |
| `expectedCordisVersion` | `4.0.2` | Exact accepted Cordis peer version |
| `allowedPackagePrefixes` | `[]` | Optional package-name prefix allowlist |

For a custom Profile, restate the entire config row and change `profile`; leaving the package default at `web` would install into the wrong Profile.

## Security properties

- The plugin refuses to load unless the DSH Web server is bound to `127.0.0.1`.
- Both routes validate a loopback Host and same-origin browser request. Mutation also requires a random per-process token fetched by the page.
- Upload filenames never become filesystem paths. Archives use generated SHA-256 names under the resolved Profile.
- Tar contents are inspected without extraction. Symlinks and unsupported entry types are rejected.
- One request owns upload and installation at a time. Client cancellation, timeout, and Cordis unload terminate the subprocess tree and roll back uncommitted archives.
- Browser responses contain stable error codes and no CLI output, secrets, or machine-specific absolute paths.
- Installing a plugin is privileged by nature: after restart, that plugin executes inside the DSH Host. Use only packages from a trusted producer.

See [security details](docs/security.md), [architecture](docs/architecture.md), and [verification layers](docs/verification.md).

## Development

```sh
npm ci
npm run check
npm pack
```

`npm run check` covers strict type checking, behavior and lifecycle tests, coverage, the keyless user-visible copy snapshot, built entry points, and packed contents. Assembled Profile and desktop tests remain separate acceptance layers.
