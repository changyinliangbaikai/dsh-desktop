# Native desktop candidate

The candidate pins Harness 0.2.1-rc.2 at 687f282e8625c6b8d11ff58211a90524be2e4317.
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

The independently built offline installer 0.8.0 pins Harness 0.2.1-rc.2 and Cordis
4.0.5. Its npm lock is resolved from an empty project and checked with npm ls.
Older archives with exact Harness peers must be rebuilt for this candidate.
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

The October 19 build pins the published `dsh-v0.2.1-rc.2` release. Product
analytics' generated `enabled` value is false while its RPC service remains
registered. Installer filenames include the downstream version. The new exact
compatibility tag is applied only after package, Profile and Desktop gates pass;
previous compatibility tags remain unchanged.

The upstream pnpm payload now lives under runtime/primary-runtime/dependencies/pnpm.
The native Host and CLI supply that invocation; the offline plugin consumes only
the public Profile package-manager contract. The final-layout smoke uses the same
path and verifies offline installation after the move.

The October 19 rc.2 transition freshly resolves Cordis 4.0.5 and
Schemastery 3.18.5. The official package operation adds engines.dsh
compatibility semantics; the bounded offline installer retains exact peer checks.
Prior archives must be rebuilt. Runtime preparation and native configuration
continue to use the unchanged upstream commands, source and package selection.

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
