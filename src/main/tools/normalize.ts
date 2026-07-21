import { probeFile } from '../ffmpeg/probe'
import { resolveOutputPath } from '../output'
import { getSettings } from '../settings'
import { FFmpegError, type JobContext, type ToolResult, type ToolRunner } from '../queue'
import {
  extOf,
  loudnormApply,
  parseLoudnormBlocks,
  runStage,
  sameFormatAudioArgs,
  truePeakLimiter,
  type LoudnormMeasured
} from './common'
import { resolveTrackCfgs } from './tracks'
import type { MediaInfo } from '../../shared/types'

interface TrackCfg {
  action: 'normalize' | 'keep' | 'exclude'
  lufs: number
  tp: number
}
const TRACK_DEFAULT: TrackCfg = { action: 'normalize', lufs: -14, tp: -1 }

/**
 * 兩段式響度標準化。
 *
 * 影片檔走逐軌路徑:各音軌可分別設定目標,一次讀取測完所有軌,
 * 再一次寫回(混成一軌或保留各軌),畫面流 copy、零中間檔。
 * 純音訊檔走單軌路徑,維持同格式輸出。
 */
export const normalizeRunner: ToolRunner = async (ctx) => {
  const info = await probeFile(ctx.spec.path)
  if (info.audioStreams.length === 0) throw new FFmpegError('no audio stream')
  return info.hasVideo ? perTrack(ctx, info) : singleTrack(ctx, info)
}

/** 純音訊檔:只處理第一軌,同格式輸出 */
async function singleTrack(ctx: JobContext, info: MediaInfo): Promise<ToolResult> {
  const cfgs = resolveTrackCfgs<TrackCfg>(ctx.spec.params['tracks'], 1, TRACK_DEFAULT)
  // 音訊檔的介面送的是單軌欄位;逐軌陣列若存在(混批時)取第一軌
  const I = Number(ctx.spec.params['lufs'] ?? cfgs[0].lufs)
  const TP = Number(ctx.spec.params['tp'] ?? cfgs[0].tp)
  const audio = info.audioStreams[0]

  // Pass 1:測量
  const measureStderr = await runStage(
    ctx,
    [
      '-i', ctx.spec.path,
      '-map', '0:a:0',
      '-af', `loudnorm=I=${I}:TP=${TP}:LRA=11:print_format=json`,
      '-f', 'null', 'NUL'
    ],
    info.durationSec,
    0,
    0.5
  )
  const [measured] = parseLoudnormBlocks(measureStderr)
  if (!measured) throw new FFmpegError(measureStderr.slice(-2000))

  // Pass 2:線性套用;loudnorm 內部升到 192kHz,必須還原取樣率
  const ext = extOf(ctx.spec.path)
  const out = resolveOutputPath(ctx.spec.path, '_normalized', ext, getSettings())
  ctx.trackOutput(out)

  await runStage(
    ctx,
    [
      '-i', ctx.spec.path,
      '-map', '0:a:0',
      '-af', loudnormApply(I, TP, measured),
      '-ar', String(audio.sampleRate || 48000),
      ...sameFormatAudioArgs(ext, audio.codec, audio.bitrate),
      '-map_metadata', '0',
      out
    ],
    info.durationSec,
    0.5,
    1
  )
  return { outputs: [out] }
}

/** 影片檔:逐軌標準化,混音或保留各軌後寫回 */
async function perTrack(ctx: JobContext, info: MediaInfo): Promise<ToolResult> {
  const count = info.audioStreams.length
  const cfgs = resolveTrackCfgs<TrackCfg>(ctx.spec.params['tracks'], count, TRACK_DEFAULT)
  // 單軌影片沒有「混音」的意義,強制走原位保留
  const output = count > 1 ? String(ctx.spec.params['output'] ?? 'mix') : 'separate'
  const limiter = Boolean(ctx.spec.params['limiter'] ?? true)

  const included = cfgs.map((cfg, i) => ({ cfg, i })).filter(({ cfg }) => cfg.action !== 'exclude')
  if (included.length === 0) throw new FFmpegError('all tracks excluded')
  const toNormalize = included.filter(({ cfg }) => cfg.action === 'normalize')

  // Pass 1:單次讀取,同時測量所有需標準化的軌
  const measuredByTrack = new Map<number, LoudnormMeasured>()
  if (toNormalize.length > 0) {
    const parts = toNormalize.map(
      ({ cfg, i }) =>
        `[0:a:${i}]loudnorm=I=${cfg.lufs}:TP=${cfg.tp}:LRA=11:print_format=json[m${i}]`
    )
    const args = ['-i', ctx.spec.path, '-filter_complex', parts.join(';')]
    for (const { i } of toNormalize) args.push('-map', `[m${i}]`, '-f', 'null', 'NUL')

    const stderr = await runStage(ctx, args, info.durationSec, 0, 0.5)
    const blocks = parseLoudnormBlocks(stderr)
    if (blocks.length < toNormalize.length) throw new FFmpegError(stderr.slice(-3000))
    // JSON 區塊順序 = filtergraph 宣告順序
    toNormalize.forEach(({ i }, k) => measuredByTrack.set(i, blocks[k]))
  }

  // Pass 2:套用 + 混音/原位 + 寫回(畫面流 copy)
  const ext = extOf(ctx.spec.path)
  const out = resolveOutputPath(
    ctx.spec.path,
    output === 'mix' ? '_mixed' : '_normalized',
    ext,
    getSettings()
  )
  ctx.trackOutput(out)

  const sr = info.audioStreams[included[0].i].sampleRate || 48000
  const from = toNormalize.length > 0 ? 0.5 : 0

  // loudnorm 內部升到 192kHz,每軌後接 aformat 還原來源取樣率
  const parts: string[] = []
  for (const { cfg, i } of toNormalize) {
    const trackSr = info.audioStreams[i].sampleRate || 48000
    parts.push(
      `[0:a:${i}]${loudnormApply(cfg.lufs, cfg.tp, measuredByTrack.get(i)!)},aformat=sample_rates=${trackSr}[a${i}]`
    )
  }

  const args = ['-i', ctx.spec.path]

  if (output === 'mix') {
    const inputLabels = included
      .map(({ cfg, i }) => (cfg.action === 'normalize' ? `[a${i}]` : `[0:a:${i}]`))
      .join('')
    let chain =
      included.length > 1
        ? `${inputLabels}amix=inputs=${included.length}:normalize=0`
        : `${inputLabels}anull`
    chain += `,aformat=sample_rates=${sr}:channel_layouts=stereo`
    if (limiter) {
      // 保險限制器:上限 = 全域 TP 目標(UI 旋鈕)。走真峰值限制(超取樣),
      // 否則各軌相加後的 inter-sample 峰值會遠超天花板
      const tpCeil = Number(ctx.spec.params['limiterTp'] ?? -1)
      chain += truePeakLimiter(tpCeil, sr)
    }
    parts.push(`${chain}[mix]`)

    args.push(
      '-filter_complex', parts.join(';'),
      '-map', '0:v?', '-map', '[mix]', '-map', '0:s?',
      '-c:v', 'copy', '-c:s', 'copy',
      '-c:a', 'aac', '-b:a', '320k'
    )
  } else {
    if (parts.length) args.push('-filter_complex', parts.join(';'))
    args.push('-map', '0:v?', '-c:v', 'copy')
    included.forEach(({ cfg, i }, n) => {
      if (cfg.action === 'normalize') {
        args.push('-map', `[a${i}]`, `-c:a:${n}`, 'aac', `-b:a:${n}`, '320k')
      } else {
        args.push('-map', `0:a:${i}`, `-c:a:${n}`, 'copy')
      }
    })
    args.push('-map', '0:s?', '-c:s', 'copy')
  }

  args.push('-map_metadata', '0', out)
  await runStage(ctx, args, info.durationSec, from, 1)
  return { outputs: [out] }
}
