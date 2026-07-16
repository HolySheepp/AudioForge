import { app } from 'electron'
import { join } from 'path'

// dev:專案根目錄 bin/;打包後:resources/bin/(electron-builder extraResources)
const binDir = app.isPackaged
  ? join(process.resourcesPath, 'bin')
  : join(app.getAppPath(), 'bin')

export const ffmpegPath = join(binDir, 'ffmpeg.exe')
export const ffprobePath = join(binDir, 'ffprobe.exe')
