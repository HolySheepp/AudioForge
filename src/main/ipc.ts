import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import { statSync, readdirSync } from 'fs'
import { join, extname } from 'path'
import { probeFile } from './ffmpeg/probe'
import { getWaveform } from './waveform'
import { ensurePreview } from './preview'
import { hapticTick, hapticTest } from './haptics'
import { resolveThemeBg } from './index'
import { ALL_EXTS } from '../shared/types'
import { detectHardware } from './ffmpeg/hardware'
import { getSettings, updateSettings } from './settings'
import { queue } from './queue'
import type { JobSpec, Settings } from '../shared/types'

type GetWindow = () => BrowserWindow | null

/** 所有 IPC handler 的註冊入口 */
export function registerIpc(getWindow: GetWindow): void {
  ipcMain.handle('app:ping', () => 'pong')

  ipcMain.handle('probe:file', async (_e, path: string) => probeFile(path))

  // 拖入的路徑集合 → 展開資料夾(遞迴)、過濾支援副檔名;回報被拒的頂層檔案數
  ipcMain.handle('fs:expandPaths', (_e, paths: string[]) => {
    const files: string[] = []
    let skipped = 0
    const walk = (p: string, topLevel: boolean): void => {
      const st = statSync(p)
      if (st.isDirectory()) {
        for (const name of readdirSync(p)) walk(join(p, name), false)
      } else if (ALL_EXTS.includes(extname(p).slice(1).toLowerCase())) {
        files.push(p)
      } else if (topLevel) {
        skipped++
      }
    }
    for (const p of paths) {
      try {
        walk(p, true)
      } catch {
        skipped++
      }
    }
    return { files, skipped }
  })

  ipcMain.handle('hw:get', () => detectHardware())

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const s = updateSettings(patch)
    queue.setConcurrency(s.concurrency)
    // 主題變更 → 同步原生視窗底色,避免切換時露出舊底色造成閃爍
    if (patch.theme) getWindow()?.setBackgroundColor(resolveThemeBg(s.theme))
    return s
  })

  ipcMain.handle('jobs:start', (_e, specs: JobSpec[]) => {
    queue.setConcurrency(getSettings().concurrency)
    queue.enqueue(specs)
  })
  ipcMain.handle('jobs:cancel', (_e, jobId: string) => queue.cancel(jobId))
  ipcMain.handle('jobs:cancelAll', () => queue.cancelAll())
  ipcMain.handle('jobs:hasActive', () => queue.hasActiveWork())

  // 觸覺回饋:tick 走 send(fire-and-forget,不等回覆);測試走 invoke
  ipcMain.on('haptic:tick', () => hapticTick())
  ipcMain.handle('haptic:test', () => hapticTest())

  ipcMain.handle('waveform:get', (_e, path: string, mtimeMs: number) => getWaveform(path, mtimeMs))

  ipcMain.handle('preview:ensure', (_e, path: string) =>
    ensurePreview(path, (frac) => {
      getWindow()?.webContents.send('preview:progress', { path, frac })
    })
  )

  ipcMain.handle('shell:showInFolder', (_e, path: string) => shell.showItemInFolder(path))

  ipcMain.handle('dialog:pickDir', async () => {
    const win = getWindow()
    if (!win) return null
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('dialog:pickAudioFile', async () => {
    const win = getWindow()
    if (!win) return null
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff', 'ac3'] }
      ]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  // 佇列更新 → 推送給 renderer
  queue.setOnUpdate((u) => {
    getWindow()?.webContents.send('jobs:update', u)
  })
}
