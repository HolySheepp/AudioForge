import type { ToolId } from '../../../shared/types'

/** 標準化 */
export interface NormalizeParams {
  lufs: number
  tp: number
}
export const NORMALIZE_DEFAULTS: NormalizeParams = { lufs: -14, tp: -1 }

/** 替換 */
export interface ReplaceParams {
  length: 'keepVideo' | 'shortest'
  codec: 'aac' | 'pcm' | 'copy'
}
export const REPLACE_DEFAULTS: ReplaceParams = { length: 'keepVideo', codec: 'aac' }

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
}
export const CONVERT_DEFAULTS: ConvertParams = {
  format: 'wav',
  wavDepth: '24',
  sampleRate: 0,
  mp3Mode: 'cbr',
  mp3Bitrate: 320,
  mp3VbrQuality: 0,
  aacBitrate: 256,
  channels: 0
}

/** 多軌 */
export interface MultitrackTrackCfg {
  action: 'normalize' | 'keep' | 'exclude'
  lufs: number
  tp: number
}
export interface MultitrackParams {
  /** 依軌序;長度隨檔案軌數延展 */
  tracks: MultitrackTrackCfg[]
  output: 'mix' | 'separate'
  limiter: boolean
  /** 混音後保險限制器的全域 True Peak 上限(dBTP) */
  limiterTp: number
}
export const MULTITRACK_TRACK_DEFAULT: MultitrackTrackCfg = { action: 'normalize', lufs: -14, tp: -1 }
export const MULTITRACK_DEFAULTS: MultitrackParams = {
  tracks: [],
  output: 'mix',
  limiter: true,
  limiterTp: -1
}

/** 混音合併 */
export interface MixdownParams {
  format: 'wav' | 'mp3' | 'aac' | 'flac'
  /** amix normalize:自動衰減避免爆音;關閉則保留各檔原音量 */
  autoLevel: boolean
  duration: 'longest' | 'shortest'
  /** 0 = 跟隨第一個輸入 */
  sampleRate: 0 | 44100 | 48000 | 96000
  limiter: boolean
}
export const MIXDOWN_DEFAULTS: MixdownParams = {
  format: 'wav',
  autoLevel: false,
  duration: 'longest',
  sampleRate: 0,
  limiter: true
}

const DEFAULTS: Record<ToolId, Record<string, unknown>> = {
  analysis: {},
  normalize: NORMALIZE_DEFAULTS as unknown as Record<string, unknown>,
  replace: REPLACE_DEFAULTS as unknown as Record<string, unknown>,
  extract: EXTRACT_DEFAULTS as unknown as Record<string, unknown>,
  convert: CONVERT_DEFAULTS as unknown as Record<string, unknown>,
  multitrack: MULTITRACK_DEFAULTS as unknown as Record<string, unknown>,
  mixdown: MIXDOWN_DEFAULTS as unknown as Record<string, unknown>
}

/** 上次參數(settings.toolParams)疊在預設值上 */
export function mergedParams<T>(tool: ToolId, saved: Record<string, Record<string, unknown>>): T {
  return { ...DEFAULTS[tool], ...(saved[tool] ?? {}) } as T
}
