# ADR 0001: Embed the official Web profile

## Status

Accepted.

## Decision

The desktop shell starts the official dsh web profile on 127.0.0.1 with an operating-system-assigned port and embeds its official React UI.

The project does not replace the HTTP/WebSocket carrier, Agent Runtime, Tool Runtime, permission presets, Sandbox, or plugin mechanism.

## Consequences

- Browser and desktop behavior stay aligned with the pinned DSH release.
- Upstream upgrades require less adapter work.
- The shell retains the official loopback Web process and its current trust model.
- Native desktop work remains focused on lifecycle, packaging, diagnostics, and Windows integration.
