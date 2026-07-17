/** 本地絕對路徑 → media:// URL(main process 註冊的自訂協定) */
export function toMediaUrl(path: string): string {
  return 'media:///' + path.split(/[\\/]/).map(encodeURIComponent).join('/')
}
