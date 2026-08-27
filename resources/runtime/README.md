# Staged runtime

The release pipeline populates this directory with:

- node/node.exe
- dsh/node_modules/@deepseek-ai/dsh/lib/bin.js and its production dependency closure
- pnpm required by official plugin management
- plugins/*.tgz reviewed in `packaging/runtime-manifest.json`

At desktop startup, each reviewed archive is integrity-checked and idempotently
installed into its declared managed Profile before the official Web process is
launched. The embedded installer plugin owns the later page-based upload flow.

Run `pnpm stage:runtime` on the target platform. Generated runtime files are
intentionally ignored; the release artifact contains them through
`electron-builder`'s `extraResources` rule.
