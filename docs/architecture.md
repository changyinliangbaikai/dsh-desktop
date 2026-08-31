# Architecture

## Runtime topology

~~~mermaid
flowchart LR
  Main["Electron Main"]
  Runtime["Pinned Node.js"]
  DSH["Official dsh web"]
  Seed["Reviewed offline-installer archive"]
  UI["Official React UI"]
  Main --> Runtime
  Main -->|verify + official dsh plugin add| Seed
  Seed --> DSH
  Runtime --> DSH
  Main --> UI
  UI <--> DSH
~~~

Electron owns the window and process lifecycle. The pinned Node executable runs the official DSH CLI with the web profile. BrowserWindow loads only the validated authenticated loopback URL announced by DSH; the bootstrap token is retained for the initial navigation but redacted from lifecycle diagnostics.

The packaged runtime is generated from a reviewed lock under
`packaging/runtime/`. Its closure contains the official npm release, Node
24.19.0 copied from the target build runner, and pnpm 11.7.0. The provenance
manifest pins the upstream tag, commit, version, and npm integrity.
It also pins every embedded plugin archive by name, version, target Profile,
filename, and SHA-512 integrity. Staging copies only matching reviewed inputs.

Browser-host permissions are granted only when Electron identifies both the
requesting WebContents and requesting origin as that validated DSH surface.
This keeps the official UI's clipboard and future browser-backed capabilities
available without granting anything to an external navigation.

## Windows window lifecycle

On Windows, a normal main-window close request is canceled and the window is
hidden while both Electron and the managed DSH runtime continue running. The
notification-area icon restores and focuses the existing window; its native
context menu also exposes an explicit exit action. A second application launch
uses the same restore path.

Explicit application exit is tracked separately from runtime shutdown progress.
It first disables close-to-tray interception, then stops the DSH process tree,
and only after that allows Electron to close the window and remove the tray icon.
The tray ICO is shipped as an unpacked resource because it is needed at runtime,
not only while electron-builder stamps the executable.

## Startup contract

For a packaged build, Desktop first verifies and idempotently installs each
embedded archive into its declared managed Profile by invoking the same pinned
DSH entry with `plugin --profile … add … --offline --ignore-scripts
--save-exact`. It skips only when the installed package version, Profile bundle
row, and persistent archive dependency all match. A runtime upgrade that moves
the archive path therefore reconciles the Profile again.

The shell launches:

~~~text
node <dsh-entry> web --no-open --host 127.0.0.1 --port 0
~~~

It waits for:

~~~text
dsh web: http://127.0.0.1:<assigned-port>
~~~

Only an HTTP URL with hostname 127.0.0.1, an explicit non-zero port, root path, and no credentials, query, or fragment is accepted.

## Ownership

Desktop owns:

- single instance and native window lifecycle;
- Windows notification-area integration and explicit application exit;
- DSH process startup, diagnostics, shutdown, and restart;
- loopback URL validation and navigation handling;
- runtime staging, Windows installation, and updates.
- integrity verification and first-run seeding of reviewed plugin archives.

DeepSeek Harness owns:

- Web server, API gateway, and official React UI;
- Agent, Tool, Session, Workspace, Permission, Sandbox, and Profile behavior;
- PowerShell, jobs, plugins, models, skills, subagents, and workflows.

No desktop transport or alternative Tool Runtime is introduced.
Archive inspection, upload policy, the Web page, and later offline installs are
owned by `dsh-offline-plugin-installer`, not by Electron.

Shutdown is process-tree scoped. POSIX builds signal the detached DSH process
group; Windows builds use `taskkill /T`, escalating to `/F` after the deadline.
