import { create } from 'zustand'
import { translate } from '../i18n'
import type {
  AnalysisResult,
  HardwareInfo,
  JobSpec,
  JobStatus,
  JobUpdate,
  MediaInfo,
  Settings,
  ToolId
} from '../../../shared/types'

export interface SourceItem {
  id: string
  path: string
  checked: boolean
  info: MediaInfo | null
  probeFailed: boolean
  status: 'idle' | JobStatus
  progress: number
  errorTail: string | null
  note: string | null
  analysis: AnalysisResult | null
  jobId: string | null
  /** replacement 功能:此影片配對的新音軌路徑 */
  replaceAudioPath: string | null
}

export interface ProcessedItem {
  id: string
  path: string
  tool: ToolId
  info: MediaInfo | null
}

export interface Toast {
  id: number
  text: string
}

let nextId = 1
const uid = (): string => String(nextId++)
let nextToast = 1

interface AppState {
  tool: ToolId
  settings: Settings | null
  hardware: HardwareInfo | null
  source: SourceItem[]
  processed: ProcessedItem[]
  selectedPath: string | null
  toasts: Toast[]

  init: () => Promise<void>
  setTool: (t: ToolId) => void
  addPaths: (raw: string[]) => Promise<void>
  removeSource: (id: string) => void
  setChecked: (id: string, v: boolean) => void
  checkAll: (v: boolean) => void
  clearSource: () => void
  moveToSource: (processedId: string) => void
  moveAllToSource: () => void
  clearProcessed: () => void
  select: (path: string | null) => void
  toast: (text: string) => void
  setReplaceAudio: (id: string, path: string | null) => void
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  saveToolParams: (tool: ToolId, params: Record<string, unknown>) => void
  startJobs: (specs: JobSpec[]) => Promise<void>
  cancelItem: (id: string) => void
  cancelAll: () => void
}

export const useApp = create<AppState>((set, get) => ({
  tool: 'analysis',
  settings: null,
  hardware: null,
  source: [],
  processed: [],
  selectedPath: null,
  toasts: [],

  init: async () => {
    const settings = await window.api.getSettings()
    set({ settings })
    applyTheme(settings.theme)
    window.api.onJobsUpdate((u) => applyJobUpdate(u, set, get))
    // 硬體偵測較慢(試編),背景進行
    window.api.getHardware().then((hardware) => set({ hardware }))
  },

  setTool: (tool) => set({ tool }),

  addPaths: async (raw) => {
    const { files, skipped } = await window.api.expandPaths(raw)
    const existing = new Set(get().source.map((s) => s.path.toLowerCase()))
    const fresh = files.filter((p) => !existing.has(p.toLowerCase()))

    const items: SourceItem[] = fresh.map((path) => ({
      id: uid(),
      path,
      checked: true,
      info: null,
      probeFailed: false,
      status: 'idle',
      progress: 0,
      errorTail: null,
      note: null,
      analysis: null,
      jobId: null,
      replaceAudioPath: null
    }))
    set((s) => ({ source: [...s.source, ...items] }))
    if (skipped > 0) {
      const lang = get().settings?.language ?? 'zh'
      get().toast(translate(lang, 'toast.unsupportedFiles', { n: skipped }))
    }

    for (const item of items) {
      window.api
        .probeFile(item.path)
        .then((info) =>
          set((s) => ({
            source: s.source.map((it) => (it.id === item.id ? { ...it, info } : it))
          }))
        )
        .catch(() =>
          set((s) => ({
            source: s.source.map((it) =>
              it.id === item.id ? { ...it, probeFailed: true, checked: false } : it
            )
          }))
        )
    }
  },

  removeSource: (id) => set((s) => ({ source: s.source.filter((it) => it.id !== id) })),

  setChecked: (id, v) =>
    set((s) => ({ source: s.source.map((it) => (it.id === id ? { ...it, checked: v } : it)) })),

  checkAll: (v) => set((s) => ({ source: s.source.map((it) => ({ ...it, checked: v })) })),

  clearSource: () => set({ source: [], selectedPath: null }),

  moveToSource: (processedId) => {
    const { processed, source } = get()
    const item = processed.find((p) => p.id === processedId)
    if (!item) return
    const inSource = source.some((s) => s.path.toLowerCase() === item.path.toLowerCase())
    set((s) => ({ processed: s.processed.filter((p) => p.id !== processedId) }))
    if (!inSource) {
      void get().addPaths([item.path])
    }
  },

  moveAllToSource: () => {
    const paths = get().processed.map((p) => p.path)
    set({ processed: [] })
    if (paths.length) void get().addPaths(paths)
  },

  clearProcessed: () => set({ processed: [] }),

  select: (path) => set({ selectedPath: path }),

  toast: (text) => {
    const id = nextToast++
    set((s) => ({ toasts: [...s.toasts, { id, text }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500)
  },

  setReplaceAudio: (id, path) =>
    set((s) => ({
      source: s.source.map((it) => (it.id === id ? { ...it, replaceAudioPath: path } : it))
    })),

  saveSettings: async (patch) => {
    const settings = await window.api.updateSettings(patch)
    set({ settings })
    if (patch.theme) applyTheme(settings.theme)
  },

  saveToolParams: (tool, params) => {
    const s = get().settings
    if (!s) return
    void get().saveSettings({ toolParams: { ...s.toolParams, [tool]: params } })
  },

  startJobs: async (specs) => {
    set((s) => ({
      source: s.source.map((it) => {
        const spec = specs.find((sp) => sp.itemId === it.id)
        return spec
          ? { ...it, jobId: spec.jobId, status: 'waiting' as const, progress: 0, errorTail: null }
          : it
      })
    }))
    await window.api.startJobs(specs)
  },

  cancelItem: (id) => {
    const item = get().source.find((it) => it.id === id)
    if (item?.jobId) void window.api.cancelJob(item.jobId)
  },

  cancelAll: () => void window.api.cancelAllJobs()
}))

function applyJobUpdate(
  u: JobUpdate,
  set: (fn: (s: AppState) => Partial<AppState>) => void,
  get: () => AppState
): void {
  set((s) => ({
    source: s.source.map((it) => {
      if (it.id !== u.itemId) return it
      return {
        ...it,
        status: u.status ?? it.status,
        progress: u.progress ?? it.progress,
        errorTail: u.errorTail ?? it.errorTail,
        note: u.note ?? it.note,
        analysis: u.analysis ?? it.analysis
      }
    })
  }))

  if (u.status === 'done' && u.outputs?.length) {
    const items: ProcessedItem[] = u.outputs.map((path) => ({
      id: uid(),
      path,
      tool: get().tool,
      info: null
    }))
    set((s) => ({ processed: [...s.processed, ...items] }))
    for (const item of items) {
      window.api
        .probeFile(item.path)
        .then((info) =>
          set((s) => ({
            processed: s.processed.map((p) => (p.id === item.id ? { ...p, info } : p))
          }))
        )
        .catch(() => undefined)
    }
  }
}

export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement
  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.dataset.theme = dark ? 'dark' : 'light'
  } else {
    root.dataset.theme = theme
  }
}

// 跟隨系統主題的即時切換
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const s = useApp.getState().settings
  if (s?.theme === 'system') applyTheme('system')
})
