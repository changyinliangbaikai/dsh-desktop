export interface StatusDocument {
  readonly title: string
  readonly heading: string
  readonly message: string
  readonly detail?: string
  readonly tone: 'loading' | 'error'
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Render the local loading or failure surface without enabling renderer script.
 * @param status - User-facing status text.
 * @returns A complete CSP-constrained HTML document.
 */
export function renderStatusDocument(status: StatusDocument): string {
  const accent = status.tone === 'error' ? '#ff6b6b' : '#56c7ff'
  const detail = status.detail === undefined
    ? ''
    : '<pre>' + escapeHtml(status.detail) + '</pre>'

  return '<!doctype html>'
    + '<html lang="zh-CN"><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + escapeHtml(status.title) + '</title>'
    + '<style>'
    + ':root{color-scheme:dark;font-family:Inter,"Microsoft YaHei",system-ui,sans-serif}'
    + 'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08111f;color:#e8f0fa}'
    + 'main{width:min(680px,calc(100vw - 64px));padding:40px;border:1px solid #20334b;border-radius:18px;background:#0d1b2d;box-shadow:0 24px 80px #0008}'
    + '.dot{width:12px;height:12px;border-radius:50%;background:' + accent + ';box-shadow:0 0 22px ' + accent + ';margin-bottom:24px}'
    + 'h1{font-size:24px;margin:0 0 12px}p{color:#a9bbcf;line-height:1.7;margin:0}'
    + 'pre{margin:24px 0 0;padding:16px;max-height:220px;overflow:auto;border-radius:10px;background:#07101c;color:#c8d6e5;white-space:pre-wrap;word-break:break-word}'
    + '</style></head><body><main><div class="dot"></div><h1>'
    + escapeHtml(status.heading)
    + '</h1><p>'
    + escapeHtml(status.message)
    + '</p>'
    + detail
    + '</main></body></html>'
}

/**
 * Convert a local document to a BrowserWindow-loadable data URL.
 * @param document - A complete HTML document.
 * @returns A UTF-8 data URL.
 */
export function toDataUrl(document: string): string {
  return 'data:text/html;charset=UTF-8,' + encodeURIComponent(document)
}
