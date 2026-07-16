import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'

const settingsPath = join(app.getPath('userData'), 'settings.json')

let current: Settings = load()

function load(): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    return { ...DEFAULT_SETTINGS, ...raw }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function getSettings(): Settings {
  return current
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = {
    ...current,
    ...patch,
    toolParams: { ...current.toolParams, ...(patch.toolParams ?? {}) },
    knobSteps: { ...current.knobSteps, ...(patch.knobSteps ?? {}) }
  }
  try {
    mkdirSync(dirname(settingsPath), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf-8')
  } catch {
    // 寫入失敗不致命;下次啟動回到預設
  }
  return current
}
