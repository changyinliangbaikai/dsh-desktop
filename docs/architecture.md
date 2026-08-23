# Architecture

## Runtime topology

~~~mermaid
flowchart LR
  Main["Electron Main"]
  Runtime["Pinned Node.js"]
  DSH["Official dsh web"]
  UI["Official React UI"]
  Main --> Runtime
  Runtime --> DSH
  Main --> UI
  UI <--> DSH
~~~

Electron owns the window and process lifecycle. The pinned Node executable runs the official DSH CLI with the web profile. BrowserWindow loads only the validated loopback origin announced by DSH.

The packaged runtime is generated from a reviewed lock under
`packaging/runtime/`. Its closure contains the official npm release, Node
24.19.0 copied from the target build runner, and pnpm 11.7.0. The provenance
manifest pins the upstream tag, commit, version, and npm integrity.

Browser-host permissions are granted only when Electron identifies both the
requesting WebContents and requesting origin as that validated DSH surface.
This keeps the official UI's clipboard and future browser-backed capabilities
available without granting anything to an external navigation.

## Startup contract

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
- DSH process startup, diagnostics, shutdown, and restart;
- loopback URL validation and navigation handling;
- runtime staging, Windows installation, and updates.

DeepSeek Harness owns:

- Web server, API gateway, and official React UI;
- Agent, Tool, Session, Workspace, Permission, Sandbox, and Profile behavior;
- PowerShell, jobs, plugins, models, skills, subagents, and workflows.

No desktop transport or alternative Tool Runtime is introduced.

Shutdown is process-tree scoped. POSIX builds signal the detached DSH process
group; Windows builds use `taskkill /T`, escalating to `/F` after the deadline.
