/**
 * 功能 ID。各功能自己處理多音軌(影片檔展開逐軌介面),
 * 因此沒有獨立的 multitrack 功能。
 */
export type ToolId = 'analysis' | 'normalize' | 'replace' | 'extract' | 'convert' | 'mixdown'

export interface AudioStreamInfo {
  /** 第幾條音軌(0-based,以音軌計) */
  index: number
  codec: string
  sampleRate: number
  channels: number
  channelLayout: string
  bitrate: number | null
  language: string | null
  title: string | null
}

export interface MediaInfo {
  path: string
  name: string
  sizeBytes: number
  durationSec: number | null
  container: string
  hasVideo: boolean
  videoCodec: string | null
  width: number | null
  height: number | null
  audioStreams: AudioStreamInfo[]
  mtimeMs: number
}

export type JobStatus = 'waiting' | 'running' | 'done' | 'failed' | 'cancelled'

export interface AnalysisResult {
  /** Integrated loudness (LUFS) */
  integrated: number
  /** Loudness range (LU) */
  range: number
  /** True peak (dBTP) */
  truePeak: number
}

/**
 * 單一音軌的分析結果;多音軌檔案每軌各一筆。
 * 各欄位皆可選——只計算設定裡有勾選的指標,沒算的就不存在。
 */
export interface TrackAnalysis {
  /** 第幾條音軌(0-based,以音軌計) */
  track: number
  /** Integrated loudness (LUFS) */
  integrated?: number
  /** Loudness range (LU) */
  range?: number
  /** True peak (dBTP) */
  truePeak?: number
  /** Crest factor(Peak − RMS, dB) */
  crest?: number
}

/**
 * 響度分析指標定義。id 為穩定鍵(存於 settings、job params)。
 * derived = 由既有 ebur128 數值算出(免費);needsAstats = 需額外 astats 測量。
 * pass = 該指標由哪一次檔案讀取產生——負擔以「讀取次數」計:
 *        'ebur'(lufs/lra/truePeak/plr 共用一次)、'astats'(crest 另一次)。
 */
export interface MetricDef {
  id: string
  unit: string
  derived: boolean
  needsAstats: boolean
  pass: 'ebur' | 'astats'
}
export const ANALYSIS_METRICS: MetricDef[] = [
  { id: 'lufs', unit: 'LUFS', derived: false, needsAstats: false, pass: 'ebur' },
  { id: 'lra', unit: 'LU', derived: false, needsAstats: false, pass: 'ebur' },
  { id: 'truePeak', unit: 'dBTP', derived: false, needsAstats: false, pass: 'ebur' },
  { id: 'plr', unit: 'LU', derived: true, needsAstats: false, pass: 'ebur' },
  { id: 'crest', unit: 'dB', derived: false, needsAstats: true, pass: 'astats' }
]
/** 分析會用到的所有讀取階段(負擔百分比 = 需要的階段數 / 這個總數) */
export const ANALYSIS_PASSES = ['ebur', 'astats'] as const
/** 預設分析的指標(crest 需另跑 astats,預設關) */
export const DEFAULT_ANALYSIS_METRICS = ['lufs', 'lra', 'truePeak', 'plr']
/** 預設釘到來源列的指標 */
export const DEFAULT_PINNED_METRICS = ['lufs', 'lra', 'truePeak']

/** 從分析結果取某指標值(plr 為衍生;來源值缺一則回 undefined) */
export function metricValue(a: TrackAnalysis, id: string): number | undefined {
  switch (id) {
    case 'lufs':
      return a.integrated
    case 'lra':
      return a.range
    case 'truePeak':
      return a.truePeak
    case 'plr':
      return a.truePeak != null && a.integrated != null ? a.truePeak - a.integrated : undefined
    case 'crest':
      return a.crest
    default:
      return undefined
  }
}

export interface JobUpdate {
  jobId: string
  itemId: string
  status?: JobStatus
  /** 0–1 */
  progress?: number
  /** stderr 尾段(失敗時) */
  errorTail?: string
  /** 任務註記代碼(如自動降級),renderer 以 i18n 顯示 */
  note?: string
  /** 完成時的輸出檔路徑(analysis 為空) */
  outputs?: string[]
  /** analysis 結果:逐音軌一筆 */
  analysis?: TrackAnalysis[]
}

export interface JobSpec {
  jobId: string
  itemId: string
  tool: ToolId
  path: string
  /** 各功能自己的參數物件(schema 見 renderer/features) */
  params: Record<string, unknown>
}

export interface HardwareInfo {
  gpuNames: string[]
  nvenc: boolean
  qsv: boolean
  amf: boolean
  /** 實測可用的視訊編碼器,null = 退回 CPU(libx264) */
  chosenEncoder: string | null
}

/** 副色選項;實際色值定義在 global.css 的 :root[data-accent=...] */
export const ACCENTS = ['blue', 'green', 'purple', 'teal', 'amber', 'rose'] as const
export type Accent = (typeof ACCENTS)[number]

/** 音效檔:檔名格式為「中文名_English Name.mp3」 */
export interface SoundInfo {
  /** 穩定 id = 檔名(不含副檔名) */
  id: string
  zhName: string
  enName: string
  path: string
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  /** 副色:預設色名稱,或自訂 hex(#rrggbb) */
  accent: string
  /** 用戶保存的自訂副色(hex,最多 5 個) */
  customAccents: string[]
  language: 'zh' | 'en'
  outputMode: 'source' | 'fixed'
  outputDir: string
  concurrency: number
  hwAccel: 'auto' | 'off'
  /** 旋鈕棘輪觸覺回饋(MX Master 4 + HapticWeb 外掛) */
  haptics: boolean
  /** 觸覺波形索引(0–15) */
  hapticWaveform: number
  /** 選用的音效 id;空字串 = 用清單第一個;'none' = 不播放 */
  soundId: string
  /** 播放時機:每個檔案完成一次 / 整批佇列完成一次 */
  soundTiming: 'perFile' | 'batch'
  /** 預覽時間軸的可視窗長度(秒);超過此長度的媒體才啟用平移 */
  previewWindowSec: number
  /** 各功能面板上次使用的參數 */
  toolParams: Record<string, Record<string, unknown>>
  /** 各旋鈕的棘輪步進選擇(key = 旋鈕 id) */
  knobSteps: Record<string, number>
  /** 響度分析要計算的指標 id(見 ANALYSIS_METRICS) */
  analysisMetrics: string[]
  /** 分析後釘到來源列的指標 id */
  pinnedMetrics: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'blue',
  customAccents: [],
  language: 'zh',
  outputMode: 'source',
  outputDir: '',
  concurrency: 3,
  hwAccel: 'auto',
  haptics: true,
  hapticWaveform: 0,
  soundId: '',
  soundTiming: 'perFile',
  previewWindowSec: 60,
  toolParams: {},
  knobSteps: {},
  analysisMetrics: DEFAULT_ANALYSIS_METRICS,
  pinnedMetrics: DEFAULT_PINNED_METRICS
}

/** 支援的副檔名(小寫、不含點) */
export const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mts', 'm2ts', 'mxf']
export const AUDIO_EXTS = ['wav', 'mp3', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff', 'ac3']
export const ALL_EXTS = [...VIDEO_EXTS, ...AUDIO_EXTS]
