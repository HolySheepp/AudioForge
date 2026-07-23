import type { ToolId } from '../../../shared/types'

/**
 * 逐軌處理的共同約定
 * ------------------
 * 影片檔一律展開逐軌介面(即使只有一軌),純音訊檔沿用單軌的簡潔介面。
 * 參數物件同時帶「單軌欄位」與「逐軌陣列」,由 main 的 runner 依實際檔案挑用——
 * 這樣同一批任務裡混到音訊檔也不會套錯路徑。
 *
 * 逐軌設定以「軌序」為 key 記憶,長度可超過目前檔案的軌數(換檔案時不會遺失)。
 */

/** 標準化:單軌欄位 + 逐軌設定 */
export interface NormalizeTrackCfg {
  action: 'normalize' | 'keep' | 'exclude'
  lufs: number
  tp: number
}
export const NORMALIZE_TRACK_DEFAULT: NormalizeTrackCfg = {
  action: 'normalize',
  lufs: -14,
  tp: -1
}
export interface NormalizeParams {
  /** 純音訊檔用 */
  lufs: number
  tp: number
  /** 影片檔逐軌用 */
  tracks: NormalizeTrackCfg[]
  /** 多軌影片:混成一軌 or 保留各軌 */
  output: 'mix' | 'separate'
  limiter: boolean
  /** 混音後保險限制器的全域 True Peak 上限(dBTP) */
  limiterTp: number
}
export const NORMALIZE_DEFAULTS: NormalizeParams = {
  lufs: -14,
  tp: -1,
  tracks: [],
  output: 'mix',
  limiter: true,
  limiterTp: -1
}

/** 替換 */
export interface ReplaceParams {
  length: 'keepVideo' | 'shortest'
  codec: 'aac' | 'pcm' | 'copy'
  /** 要被換掉的音軌(0-based);-1 = 換掉全部音軌 */
  targetTrack: number
}
export const REPLACE_DEFAULTS: ReplaceParams = {
  length: 'keepVideo',
  codec: 'aac',
  targetTrack: 0
}

/** 抽取 */
export interface ExtractParams {
  mode: 'lossless' | 'wav' | 'mp3' | 'flac'
  /** 要抽的音軌(0-based) */
  tracks: number[]
}
export const EXTRACT_DEFAULTS: ExtractParams = { mode: 'lossless', tracks: [0] }

/** 轉檔 */
export interface ConvertParams {
  format: 'wav' | 'mp3' | 'aac' | 'flac'
  wavDepth: '16' | '24' | '32f'
  /** 0 = 保持原始 */
  sampleRate: 0 | 44100 | 48000 | 96000
  mp3Mode: 'cbr' | 'vbr'
  mp3Bitrate: 128 | 192 | 256 | 320
  mp3VbrQuality: 0 | 2
  aacBitrate: 128 | 192 | 256 | 320
  /** 0 = 保持原始 */
  channels: 0 | 1 | 2
  /** 要轉的音軌(0-based);每軌各自輸出一個檔 */
  tracks: number[]
}
export const CONVERT_DEFAULTS: ConvertParams = {
  format: 'wav',
  wavDepth: '24',
  sampleRate: 0,
  mp3Mode: 'cbr',
  mp3Bitrate: 320,
  mp3VbrQuality: 0,
  aacBitrate: 256,
  channels: 0,
  tracks: [0]
}

/** 分析 */
export interface AnalysisParams {
  /** 要分析的音軌(0-based) */
  tracks: number[]
}
export const ANALYSIS_DEFAULTS: AnalysisParams = { tracks: [0] }

// 混音改成卡片制(store 的 mixCards),每張卡自帶參數,不走這裡的
// mergedParams/toolParams 記憶機制——沒有「上次用過的單一組參數」這種東西。

const DEFAULTS: Record<Exclude<ToolId, 'mixdown'>, Record<string, unknown>> = {
  analysis: ANALYSIS_DEFAULTS as unknown as Record<string, unknown>,
  normalize: NORMALIZE_DEFAULTS as unknown as Record<string, unknown>,
  replace: REPLACE_DEFAULTS as unknown as Record<string, unknown>,
  extract: EXTRACT_DEFAULTS as unknown as Record<string, unknown>,
  convert: CONVERT_DEFAULTS as unknown as Record<string, unknown>
}

/** 上次參數(settings.toolParams)疊在預設值上;不適用於 mixdown(見上方註解) */
export function mergedParams<T>(
  tool: Exclude<ToolId, 'mixdown'>,
  saved: Record<string, Record<string, unknown>>
): T {
  return { ...DEFAULTS[tool], ...(saved[tool] ?? {}) } as T
}

/**
 * 依檔案軌數把逐軌設定補滿。超出目前軌數的既有記憶保留在後面,
 * 換到軌數較少的檔案再換回來時設定還在。
 */
export function padTracks<T>(saved: T[], count: number, fill: T): T[] {
  const next = [...saved]
  while (next.length < count) next.push(fill)
  return next
}

/** 勾選集合限制在 [0, count) 內;全被濾掉時退回第一軌 */
export function clampTrackSelection(tracks: number[], count: number): number[] {
  const kept = tracks.filter((i) => i < count).sort((a, b) => a - b)
  return kept.length ? kept : [0]
}
