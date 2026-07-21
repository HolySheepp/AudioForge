import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'

const settingsPath = join(app.getPath('userData'), 'settings.json')

let current: Settings = load()

function load(): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const merged = { ...DEFAULT_SETTINGS, ...raw }
    // 清掉舊版遺留的孤兒鍵(multitrack 功能已併入各功能)
    if (merged.toolParams) {
      const { multitrack: _drop, ...rest } = merged.toolParams as Record<string, unknown>
      merged.toolParams = rest as Settings['toolParams']
    }
    if (merged.knobSteps) {
      merged.knobSteps = Object.fromEntries(
        Object.entries(merged.knobSteps).filter(([k]) => !k.startsWith('mt.'))
      )
    }
    return merged
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function getSettings(): Settings {
  return current
}

// 落盤去抖動:旋鈕拖曳每跨一齒就 updateSettings 一次,同步寫盤會很頻繁。
// 記憶體值即時更新(讀取永遠最新),寫盤延後合併;退出前強制沖掉。
let flushTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false

function flush(): void {
  if (!dirty) return
  dirty = false
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    mkdirSync(dirname(settingsPath), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf-8')
  } catch {
    // 寫入失敗不致命;下次啟動回到預設
  }
}

app.on('will-quit', flush)

export function updateSettings(patch: Partial<Settings>): Settings {
  current = {
    ...current,
    ...patch,
    toolParams: { ...current.toolParams, ...(patch.toolParams ?? {}) },
    knobSteps: { ...current.knobSteps, ...(patch.knobSteps ?? {}) }
  }
  dirty = true
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, 400)
  return current
}
