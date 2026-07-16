/** 六大功能 ID */
export type ToolId = 'analysis' | 'normalize' | 'replace' | 'extract' | 'convert' | 'multitrack'

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
  /** analysis 結果 */
  analysis?: AnalysisResult
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

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  language: 'zh' | 'en'
  outputMode: 'source' | 'fixed'
  outputDir: string
  concurrency: number
  hwAccel: 'auto' | 'off'
  /** 各功能面板上次使用的參數 */
  toolParams: Record<string, Record<string, unknown>>
  /** 各旋鈕的棘輪步進選擇(key = 旋鈕 id) */
  knobSteps: Record<string, number>
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: 'zh',
  outputMode: 'source',
  outputDir: '',
  concurrency: 3,
  hwAccel: 'auto',
  toolParams: {},
  knobSteps: {}
}

/** 支援的副檔名(小寫、不含點) */
export const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mts', 'm2ts', 'mxf']
export const AUDIO_EXTS = ['wav', 'mp3', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff', 'ac3']
export const ALL_EXTS = [...VIDEO_EXTS, ...AUDIO_EXTS]
