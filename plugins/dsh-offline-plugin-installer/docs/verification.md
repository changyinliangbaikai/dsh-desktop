# Verification layers

Report only layers actually run.

| Layer | What it proves | What it does not prove |
|---|---|---|
| Repository tests | Config, validation, storage, HTTP, CLI lifecycle, page behavior | Published archive completeness or real DSH composition |
| Built and packed tests | Plain-Node Host import, loader-safe client bundle, tar parser bundling, packed files | Installation into a Profile |
| Isolated Profile | Official CLI install, bundle reconciliation, Host route and Web client discovery | Desktop embedding or restart UX |
| Restart acceptance | Installed plugin activates after a real Profile restart | Safety/functionality of arbitrary third-party packages |
| Desktop staging | Exact installer archive and integrity embedded and seeded into managed `web` Profile | Windows installer behavior unless run on Windows |
| Windows/native | Process-tree termination, path handling, packaged desktop restart | Other platform matrices |
| Manual/subjective | Drag/drop, messages, visual quality, restart instructions | Deterministic automated gates |

The default repository gate is keyless and offline. It does not make paid API calls, contact a registry during installation tests, or claim a desktop package was produced.
