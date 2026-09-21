# Native Desktop build boundary

The pinned upstream source and compiled main.js remain unchanged. Dsh-Desktop owns a small Electron entry that registers Windows tray visibility handlers, then imports the original native entry before readiness. It identifies only the main application navigation, excludes dialogs, never intercepts an explicit quit, and delegates Host shutdown to the native before-quit sequence. If tray creation fails, normal window close remains available.

The complete runtime is installed under resources/app/dsh on the real filesystem, with ASAR disabled. LibreOfficeKit uses spawn and native filesystem reads; unpacking only EXE/DLL files leaves configuration resources unavailable and does not resolve virtual executable paths. After electron-builder's metadata cleanup, the sealed runtime is restored byte-for-byte. Final verification checks the whole inventory and converts an actual DOCX with the final executable.

The reviewed offline installer remains an independently buildable npm/DSH package. Its exact archive and extracted contents are staged into the application runtime; a generated Web bundle row selects the desktop Profile. The plugin owns upload validation, storage, authentication and installation. It invokes the public operation shared by dsh plugin, using the active Profile's bundled package-manager invocation with offline and ignore-scripts enforced. No native Host entry is recursively invoked as a CLI.

Runtime deltas are limited to four search configuration resources, the Web bundle's installer row and declared dependency metadata, and the reviewed package files/archive. Native staging verifies the original inventory, applies these allowlisted changes and reseals it. The plugin's exact peers must match runtime packages. Existing upstream executable bytes cannot change.

Release checks authenticate the installer routes, discover its client injection, install a self-contained archive through HTTP and bundled pnpm, and restart the Profile to verify activation. Repository checks cover tray restoration, ordinary close, explicit quit, dialogs, tray failure and session shutdown. Interactive Windows tray clicks and actual customer model connectivity remain manual gates.

The accepted integration stack lock is unchanged. Automatic update feeds and mandatory-update policy metadata remain absent. Custom user patches may override search defaults. The legacy shell and its older archived installer remain historical compatibility artifacts, not the current native entry.
