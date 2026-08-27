# Desktop icon assets

`icon-source.svg` is the blue DeepSeek whale favicon copied from the pinned
official DeepSeek Harness website asset at `website/public/favicon.svg`, commit
`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.

`icon.png`, `icon.ico`, and `icon.icns` are deterministic packaging derivatives
of that source. Windows uses the multi-resolution ICO for the executable,
shortcuts, installer, uninstaller, and notification-area icon. The Windows
package copies the ICO to an unpacked resource for runtime tray access. macOS
uses the ICNS container.
