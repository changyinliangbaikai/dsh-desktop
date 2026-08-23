# AGENTS.md

This repository is the thin Windows desktop shell for the official DeepSeek Harness Web profile.

## Product boundary

- Keep DeepSeek Harness pinned and unmodified.
- Launch the official web profile; do not reimplement Agent, Tool, Session, Permission, Sandbox, Profile, or plugin behavior.
- Desktop-owned behavior is limited to application lifecycle, native window integration, runtime staging, diagnostics, installation, and update.
- Preserve the full official feature surface, including PowerShell, plugin management, and danger-full-access.

## Engineering rules

- ESM and strict TypeScript only.
- Keep Electron-specific glue thin; move parsing, policy, and lifecycle logic into independently testable modules.
- Validate every process, URL, filesystem, and renderer boundary.
- Use maintained dependencies only when they remove meaningful owned code.
- Add behavior tests before or with implementation.
- Every bug fix adds a regression test.
- Never weaken a failing check to make CI pass.
- Keep the official DeepSeek Harness checkout read-only.

## Required checks

Run focused tests during development. Before handoff run:

~~~sh
pnpm run check
~~~

Windows-specific behavior must additionally pass the Windows CI job and native acceptance suite.
