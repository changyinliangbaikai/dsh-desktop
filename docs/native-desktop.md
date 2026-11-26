# Native Windows desktop

The Windows runtime pins Harness `dsh-v0.2.3-alpha.2` at `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`.
The upstream checkout, compiled native main.js and Host remain byte-identical.
Upstream now owns Windows tray behavior, its first-close notice, explicit quit
confirmation, complete Office package unpacking, and engine resolution. The
previous downstream native entry and tray observer are retained as historical
source but are not shipped or loaded in this candidate.

Dsh-Desktop uses upstream ASAR selection and unpack flags. It restores the sealed
DSH bytes after electron-builder metadata cleanup without changing file selection
or unpack flags, then inventories every final file. The unchanged upstream payload fixture checks native dependencies, bundled pnpm,
PTY teardown and search executables. Downstream gates boot the real Host, install
the embedded offline fixture, check restart activation and search defaults, and
exercise native window close/restore/quit. Office conversion and Word preview are
opt-in through DSH_VALIDATE_OFFICE=1 (workflow validateOffice). Default staging
uses the original upstream preparation commands with the supported
prepare:dsh --defer-runtime-smoke option. No upstream source is patched to skip a
check. The final resource inventory and Office entry/engine hashes remain required.

The offline installer `0.10.0` is shared with Linux. It pins Harness `0.2.3-alpha.2`
and Cordis `4.2.0-alpha.1`. Its independent npm graph is checked with `npm ls`.
Rebuild older archives with exact Harness peers for this release.
Its source and package retain ownership of all installation behavior.

Only four Web Search YAML resources, the generated Web bundle installation row,
disabled product-analytics collection policy and dependency metadata, and the
reviewed offline plugin archive/tree are added or configured. No public update feed or mandatory-update policy is embedded.
Search defaults remain user-overridable. Offline packaging does not remove the
model endpoint's network requirement; the native welcome screen permits skipping
account login and configuring an intranet provider afterward.

The accepted workspace stack lock stays unchanged until full supported-stack
acceptance. The user confirmed Word preview works with client 0.5.0-native.1 and the updated
x64 Visual C++ runtime, and asked to omit that regression check on future builds.
Hosted Windows acceptance remains distinct from customer Windows 10 interaction.

The Office engine also depends on the system x64 Microsoft Visual C++ v14
Redistributable; it is not included by the upstream kit. Clean-machine operators
must prepare Microsoft's offline runtime installer separately. CI records its
runtime DLL versions so hosted-runner success is not presented as proof of a
prerequisite-free Windows 10 installation. This is a dependency finding, not a
confirmed diagnosis of the earlier customer failure.

The generated configuration sets product analytics `enabled` to false while keeping
its service registered. Installer filenames include the downstream version.

The upstream pnpm payload now lives under runtime/primary-runtime/dependencies/pnpm.
The native Host and CLI supply that invocation; the offline plugin consumes only
the public Profile package-manager contract. The final-layout smoke uses the same
path and verifies offline installation after the move.

Harness `0.2.3-alpha.2` uses Schemastery `3.20.0-alpha.1`. The installer uses the
public `settings.section` contribution and authenticated WebServer registration.
Its package operations continue to enforce the new runtime's exact peers.

The first alpha.4 overlay gate rejected a stale runtime peer declaration for
dsh-client-ui-slots. It is used only in type imports and module augmentation;
keep its exact devDependency and exclude it from runtime peers, as the native
renderer already bundles the service. Packed-entry regression coverage prevents
reintroducing the requirement. No missing-peer check is suppressed in Desktop.

The rc.2 base adds web-deepseek-api, which registers both API search and API
fetch. The generated base disables this row and web-search-deepseek; the default
HTTP fetch provider remains enabled. The four tool presets still exclude
web_search. Regression coverage rejects missing, renamed and duplicate provider
rows, so a changed upstream shape requires review before packaging.


Unsigned preparation uses the unchanged upstream local build and local-package
staging scripts. A regression runs the real downstream preparation orchestrator
with isolated command boundaries, checking build/pack provenance, stage order,
target environment and the Office-smoke deferral. The native Profile smoke reads
templates from the new public dsh-official-bundles package.


The latest native close-confirmation renderer is a WebContentsView overlay, not
an additional BrowserWindow. The GUI smoke enumerates live webContents at the
exact shell dialog URL before clicking the real acknowledgement button. Window
hide, restore and quit assertions remain mandatory. The selector regression
covers an overlay absent from the window roster and ignores destroyed/unrelated
renderers; it does not invoke private native lifecycle methods.


Per-Peer index injections require the request identity resolved by the Web
server. The isolated-Profile gate checks the authenticated HTTP HTML for the
installer contribution instead of invoking collectIndexInjections without a
Peer. Unauthenticated-route rejection, package installation and restart
activation remain separate mandatory assertions. No owner principal is fabricated.

The build uses Node `24.22.3`. The final-layout gate reads the bundled Electron
Node version and verifies its agreement with the runtime descriptor. Office Kit
`0.2.3` publishes `bin/dsoffice.exe` as its engine. The gate checks that executable
against the upstream prebuild manifest and the pinned digest.
