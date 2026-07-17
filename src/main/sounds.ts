import { app } from 'electron'
import { readdirSync } from 'fs'
import { join, parse } from 'path'
import type { SoundInfo } from '../shared/types'

// dev:專案 resources/sounds;打包後:resources/sounds(electron-builder extraResources)
const soundsDir = app.isPackaged
  ? join(process.resourcesPath, 'sounds')
  : join(app.getAppPath(), 'resources', 'sounds')

let cached: SoundInfo[] | null = null

/** 檔名格式:「中文名_English Name.mp3」;無底線時中英同名 */
export function listSounds(): SoundInfo[] {
  if (cached) return cached
  let files: string[] = []
  try {
    files = readdirSync(soundsDir).filter((f) => f.toLowerCase().endsWith('.mp3'))
  } catch {
    return (cached = [])
  }

  cached = files.map((file) => {
    const stem = parse(file).name
    const sep = stem.indexOf('_')
    const zhName = sep > 0 ? stem.slice(0, sep) : stem
    // 尾端的 _ 是檔名裡的殘留(如「感應器_Sensor_」),顯示時去掉
    const enName = (sep > 0 ? stem.slice(sep + 1) : stem).replace(/_+$/, '').trim()
    return { id: stem, zhName, enName: enName || zhName, path: join(soundsDir, file) }
  })
  return cached
}
