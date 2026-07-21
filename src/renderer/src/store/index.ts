import { create } from 'zustand'
import { translate } from '../i18n'
import { toMediaUrl } from '../utils/media'
import type {
  HardwareInfo,
  JobSpec,
  JobStatus,
  JobUpdate,
  MediaInfo,
  Settings,
  SoundInfo,
  ToolId,
  TrackAnalysis
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
  analysis: TrackAnalysis[] | null
  jobId: string | null
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
  sounds: SoundInfo[]
  source: SourceItem[]
  processed: ProcessedItem[]
  selectedPath: string | null
  toasts: Toast[]
  /** replace 功能:選作新音軌的音訊檔路徑(單選) */
  replaceAudio: string | null
  /** 響度分析:各來源檔要分析的軌序(path → 軌序陣列);無此鍵 = 全部軌 */
  analysisTracks: Record<string, number[]>

  init: () => Promise<void>
  playSound: (soundId?: string) => void
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
  setReplaceAudio: (path: string | null) => void
  /** 切換某檔某軌是否納入分析(allTracks = 該檔全部軌序,供預設值) */
  toggleAnalysisTrack: (path: string, track: number, allTracks: number[]) => void
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  saveToolParams: (tool: ToolId, params: Record<string, unknown>) => void
  /** groupItemIds:單一 job 涵蓋多個來源項(mixdown)時,全部標上同一 jobId */
  startJobs: (specs: JobSpec[], groupItemIds?: string[]) => Promise<void>
  cancelItem: (id: string) => void
  cancelAll: () => void
}

export const useApp = create<AppState>((set, get) => ({
  tool: 'analysis',
  settings: null,
  hardware: null,
  sounds: [],
  source: [],
  processed: [],
  selectedPath: null,
  toasts: [],
  replaceAudio: null,
  analysisTracks: {},

  init: async () => {
    const settings = await window.api.getSettings()
    set({ settings })
    applyTheme(settings.theme)
    applyAccent(settings.accent)
    window.api.onJobsUpdate((u) => applyJobUpdate(u, set, get))
    // 硬體偵測較慢(試編),背景進行
    window.api.getHardware().then((hardware) => set({ hardware }))
    window.api.listSounds().then((sounds) => set({ sounds }))
  },

  /** 播放提示音;不指定 id 時用設定選的(未選則清單第一個;'none' 不播放) */
  playSound: (soundId) => {
    const { sounds, settings } = get()
    if (!sounds.length) return
    const id = soundId ?? settings?.soundId
    if (id === 'none') return
    const sound = sounds.find((s) => s.id === id) ?? sounds[0]
    const audio = new Audio(toMediaUrl(sound.path))
    void audio.play().catch(() => undefined)
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
      jobId: null
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
            // 軌數要 probe 完才知道,所以互斥規則得在這裡再收斂一次
            source: exclusive(
              s.source.map((it) => (it.id === item.id ? { ...it, info } : it)),
              null
            )
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

  removeSource: (id) =>
    set((s) => {
      const item = s.source.find((it) => it.id === id)
      return {
        source: s.source.filter((it) => it.id !== id),
        // 被移除的正是選中的新音軌 → 一併清掉
        replaceAudio: item && item.path === s.replaceAudio ? null : s.replaceAudio
      }
    }),

  setChecked: (id, v) =>
    set((s) => {
      const next = s.source.map((it) => (it.id === id ? { ...it, checked: v } : it))
      return { source: v ? exclusive(next, id) : next }
    }),

  checkAll: (v) =>
    set((s) => {
      const next = s.source.map((it) => ({ ...it, checked: v && !it.probeFailed }))
      // 全選是批次意圖 → 多軌檔讓位
      return { source: v ? exclusive(next, null) : next }
    }),

  clearSource: () => set({ source: [], selectedPath: null, replaceAudio: null }),

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

  setReplaceAudio: (path) => set({ replaceAudio: path }),

  toggleAnalysisTrack: (path, track, allTracks) =>
    set((s) => {
      const cur = s.analysisTracks[path] ?? allTracks
      const next = cur.includes(track)
        ? cur.filter((n) => n !== track)
        : [...cur, track].sort((a, b) => a - b)
      return { analysisTracks: { ...s.analysisTracks, [path]: next } }
    }),

  saveSettings: async (patch) => {
    const settings = await window.api.updateSettings(patch)
    set({ settings })
    if (patch.theme) applyTheme(settings.theme)
    if (patch.accent) applyAccent(settings.accent)
  },

  saveToolParams: (tool, params) => {
    const s = get().settings
    if (!s) return
    void get().saveSettings({ toolParams: { ...s.toolParams, [tool]: params } })
  },

  startJobs: async (specs, groupItemIds) => {
    set((s) => ({
      source: s.source.map((it) => {
        const spec =
          specs.find((sp) => sp.itemId === it.id) ??
          (groupItemIds?.includes(it.id) ? specs[0] : undefined)
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

/** 多軌檔(音軌數 > 1);逐軌介面的參數只能對應一個檔案,故與批次互斥 */
export function isMultiTrack(it: SourceItem): boolean {
  return (it.info?.audioStreams.length ?? 0) > 1
}

/**
 * 多軌與批次互斥:勾選集合裡最多只能有一個多軌檔,且它一旦入選就得獨佔。
 *
 * priorityId = 使用者剛剛親手勾的項目,它的意圖優先。沒有(全選、拖入、probe 完成
 * 這類非針對性的變動)時則讓批次贏——多軌檔被取消勾選,使用者再單獨點它即可獨佔。
 */
function exclusive(source: SourceItem[], priorityId: string | null): SourceItem[] {
  const checked = source.filter((it) => it.checked)
  if (checked.length <= 1) return source

  const priority = priorityId ? checked.find((it) => it.id === priorityId) : undefined
  if (priority && isMultiTrack(priority)) {
    return source.map((it) => ({ ...it, checked: it.id === priority.id }))
  }
  if (!checked.some(isMultiTrack)) return source
  return source.map((it) => (isMultiTrack(it) ? { ...it, checked: false } : it))
}

function hasActiveJobs(source: SourceItem[]): boolean {
  return source.some((it) => it.status === 'waiting' || it.status === 'running')
}

function applyJobUpdate(
  u: JobUpdate,
  set: (fn: (s: AppState) => Partial<AppState>) => void,
  get: () => AppState
): void {
  const wasActive = hasActiveJobs(get().source)

  set((s) => ({
    source: s.source.map((it) => {
      // 以 jobId 比對:mixdown 這類「一個 job 涵蓋多個來源項」的更新才能同步到每一列
      if (it.jobId !== u.jobId && it.id !== u.itemId) return it
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

  const timing = get().settings?.soundTiming ?? 'perFile'
  if (timing === 'perFile') {
    // 每個檔案成功完成各響一次(失敗/取消不響)
    if (u.status === 'done') get().playSound()
  } else if (wasActive && !hasActiveJobs(get().source)) {
    // 整批任務跑完的那一刻響一次
    get().playSound()
  }

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

/** 'system' 解析為實際生效的 light/dark */
export function resolveEffectiveTheme(theme: Settings['theme']): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

/**
 * 套用主題。切換的當下先停用所有 transition,讓整個畫面在同一影格改色,
 * 避免有 transition 的元素(按鈕等)比容器慢一拍造成閃爍。
 */
export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement
  root.classList.add('theme-switching')
  root.dataset.theme = resolveEffectiveTheme(theme)
  // 強制重排,確保新顏色在 transition 仍停用時就繪出
  void root.offsetHeight
  requestAnimationFrame(() => root.classList.remove('theme-switching'))
}

export function applyAccent(accent: string): void {
  const root = document.documentElement
  if (accent.startsWith('#')) {
    // 自訂 hex:行內覆蓋 --accent(勝過樣式表的 data-accent 規則)
    delete root.dataset.accent
    root.style.setProperty('--accent', accent)
  } else {
    root.style.removeProperty('--accent')
    root.dataset.accent = accent
  }
}

// 跟隨系統主題的即時切換
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const s = useApp.getState().settings
  if (s?.theme === 'system') applyTheme('system')
})
