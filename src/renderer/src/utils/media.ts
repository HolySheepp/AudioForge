/**
 * 本地絕對路徑 → media:// URL(main process 註冊的自訂協定)。
 * media 是標準 scheme(媒體 byte-range 需要),故 URL 必須有 host,
 * 且整個路徑編成單一片段,避免 Chromium 的 URL 安全檢查擋下。
 */
export function toMediaUrl(path: string): string {
  return 'media://file/' + encodeURIComponent(path)
}
