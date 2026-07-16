import { app } from 'electron'
import { createHash } from 'crypto'
import { mkdirSync, readdirSync, statSync, rmSync } from 'fs'
import { join } from 'path'

export const cacheDir = join(app.getPath('temp'), 'audioforge-cache')

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function initCache(): void {
  mkdirSync(cacheDir, { recursive: true })
  // 啟動時清 7 天前的快取
  try {
    const now = Date.now()
    for (const name of readdirSync(cacheDir)) {
      const p = join(cacheDir, name)
      try {
        if (now - statSync(p).mtimeMs > SEVEN_DAYS_MS) rmSync(p, { recursive: true, force: true })
      } catch {
        /* 單檔失敗略過 */
      }
    }
  } catch {
    /* 快取清理失敗不致命 */
  }
}

/** 快取 key = 來源路徑 + mtime;kind 區分 waveform / proxy */
export function cacheKeyPath(srcPath: string, mtimeMs: number, kind: string, ext: string): string {
  const hash = createHash('sha1').update(`${srcPath}|${mtimeMs}`).digest('hex').slice(0, 20)
  return join(cacheDir, `${kind}-${hash}.${ext}`)
}
