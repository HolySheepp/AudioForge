import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { HardwareInfo, JobSpec, JobUpdate, MediaInfo, Settings, SoundInfo } from '../shared/types'

/** 暴露給 renderer 的 API;所有檔案系統與 FFmpeg 操作都經由這裡進 main process */
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),

  /** 拖放檔案 → 絕對路徑(新版 Electron 已移除 File.path) */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  probeFile: (path: string): Promise<MediaInfo> => ipcRenderer.invoke('probe:file', path),
  expandPaths: (paths: string[]): Promise<{ files: string[]; skipped: number }> =>
    ipcRenderer.invoke('fs:expandPaths', paths),

  getHardware: (): Promise<HardwareInfo> => ipcRenderer.invoke('hw:get'),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:update', patch),

  startJobs: (specs: JobSpec[]): Promise<void> => ipcRenderer.invoke('jobs:start', specs),
  cancelJob: (jobId: string): Promise<void> => ipcRenderer.invoke('jobs:cancel', jobId),
  cancelAllJobs: (): Promise<void> => ipcRenderer.invoke('jobs:cancelAll'),
  hasActiveJobs: (): Promise<boolean> => ipcRenderer.invoke('jobs:hasActive'),

  onJobsUpdate: (cb: (u: JobUpdate) => void): (() => void) => {
    const listener = (_e: unknown, u: JobUpdate): void => cb(u)
    ipcRenderer.on('jobs:update', listener)
    return () => ipcRenderer.removeListener('jobs:update', listener)
  },

  /** 旋鈕棘輪跨齒 → 觸覺 tick(fire-and-forget) */
  hapticTick: (): void => ipcRenderer.send('haptic:tick'),
  hapticTest: (): Promise<boolean> => ipcRenderer.invoke('haptic:test'),

  listSounds: (): Promise<SoundInfo[]> => ipcRenderer.invoke('sounds:list'),

  getWaveform: (path: string, mtimeMs: number): Promise<number[]> =>
    ipcRenderer.invoke('waveform:get', path, mtimeMs),
  ensurePreview: (path: string): Promise<{ url: string; kind: 'video' | 'audio'; isProxy: boolean }> =>
    ipcRenderer.invoke('preview:ensure', path),
  onPreviewProgress: (cb: (p: { path: string; frac: number }) => void): (() => void) => {
    const listener = (_e: unknown, p: { path: string; frac: number }): void => cb(p)
    ipcRenderer.on('preview:progress', listener)
    return () => ipcRenderer.removeListener('preview:progress', listener)
  },

  showInFolder: (path: string): Promise<void> => ipcRenderer.invoke('shell:showInFolder', path),
  pickDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickDir'),
  pickAudioFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickAudioFile')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
