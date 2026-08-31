# AGENTS.md

This repository is the thin Windows desktop shell for the official DeepSeek Harness Web profile.

## Product boundary

- Keep DeepSeek Harness pinned and unmodified.
- Launch the official web profile; do not reimplement Agent, Tool, Session, Permission, Sandbox, Profile, or plugin behavior.
- `plugins/dsh-offline-plugin-installer/` is a private in-tree DSH package released with Desktop. It owns archive validation, Profile-local storage, the Web installation page, and official-CLI orchestration; Electron owns only reproducible packaging, integrity verification, and bootstrap seeding.
- Desktop-owned behavior is limited to application lifecycle, native window integration, runtime staging, diagnostics, installation, and update.
- Preserve the full official feature surface, including PowerShell, plugin management, and danger-full-access.

## Engineering rules

- ESM and strict TypeScript only.
- Keep Electron-specific glue thin; move parsing, policy, and lifecycle logic into independently testable modules.
- Validate every process, URL, filesystem, and renderer boundary.
- Treat the official Web ready URL as credential-bearing input: validate the exact loopback/authentication shape, retain it for the first navigation, and redact credentials before recording lifecycle output or diagnostics.
- Re-resolve the embedded runtime from a fresh lock graph when the Harness version changes, pin shared runtime singletons required by published peers, and require `pnpm peers check` plus a real staged-runtime startup before accepting the closure.
- Keep the in-tree plugin on its own npm lock and public DSH/Cordis seams. Desktop code must not import its source or depend on its `node_modules`; the committed bootstrap archive must reproduce byte-for-byte from that source before checks or runtime staging pass.
- Use maintained dependencies only when they remove meaningful owned code.
- Add behavior tests before or with implementation.
- Every bug fix adds a regression test.
- Never weaken a failing check to make CI pass.
- Keep the official DeepSeek Harness checkout read-only.

## Required checks

Run focused tests during development. Before handoff run:

~~~sh
npm --prefix plugins/dsh-offline-plugin-installer ci
pnpm run check
~~~

`pnpm run check` includes the in-tree plugin's complete package gate and archive reproducibility check. Windows-specific behavior must additionally pass the Windows CI job and native acceptance suite.
