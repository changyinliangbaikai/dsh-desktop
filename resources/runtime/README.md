# Staged runtime

The release pipeline populates this directory with:

- node/node.exe
- dsh/node_modules/@deepseek-ai/dsh/lib/bin.js and its production dependency closure
- pnpm required by official plugin management

Run `pnpm stage:runtime` on the target platform. Generated runtime files are
intentionally ignored; the release artifact contains them through
`electron-builder`'s `extraResources` rule.
