# Native desktop candidate

The candidate pins Harness 0.1.7-rc.2 at 477b4f420553e8a52c2fbccc464d7561b239c443.
The upstream checkout, compiled native main.js and Host remain byte-identical.
Upstream now owns Windows tray behavior, its first-close notice, explicit quit
confirmation, complete Office package unpacking, and engine resolution. The
previous downstream native entry and tray observer are retained as historical
source but are not shipped or loaded in this candidate.

Dsh-Desktop uses upstream ASAR selection and unpack flags. It restores the sealed
DSH bytes after electron-builder metadata cleanup without changing file selection
or unpack flags, then inventories every final file. Upstream's final-layout smoke
boots the real Host, converts DOCX/XLSX/PPTX and exercises the standalone Office
CLI. Separate downstream gates install the embedded offline fixture with bundled
pnpm, check restart activation, verify search defaults, and exercise the native
window preview and close/restore/quit paths.

The independently built offline installer 0.3.0 pins Harness 0.1.7-rc.2 and Cordis
4.0.4. Its npm lock is resolved from an empty project and checked with npm ls.
Older archives with exact Harness peers must be rebuilt for this candidate.
Its source and package retain ownership of all installation behavior.

Only four Web Search YAML resources, the generated Web bundle installation row
and dependency metadata, and the reviewed offline plugin archive/tree are added
or configured. No public update feed or mandatory-update policy is embedded.
Search defaults remain user-overridable. Offline packaging does not remove the
model endpoint's network requirement; the native welcome screen permits skipping
account login and configuring an intranet provider afterward.

The accepted workspace stack lock stays unchanged until full supported-stack
acceptance. A candidate build does not by itself establish Windows 10 customer
preview acceptance or repair the previously reported machine-specific failure.

The Office engine also depends on the system x64 Microsoft Visual C++ v14
Redistributable; it is not included by the upstream kit. Clean-machine operators
must prepare Microsoft's offline runtime installer separately. CI records its
runtime DLL versions so hosted-runner success is not presented as proof of a
prerequisite-free Windows 10 installation. This is a dependency finding, not a
confirmed diagnosis of the earlier customer failure.
