import { probeFile } from '../ffmpeg/probe'
import { resolveOutputPath } from '../output'
import { getSettings } from '../settings'
import { FFmpegError, type ToolRunner } from '../queue'
import { extOf, loudnormApply, parseLoudnormBlocks, runStage, type LoudnormMeasured } from './common'

interface TrackCfg {
  action: 'normalize' | 'keep' | 'exclude'
  lufs: number
  tp: number
}

/**
 * 多軌工作流:對檔內各音軌分別標準化,一次混音(或原位保留)寫回。
 * 整個流程:讀 2 次、寫 1 次,畫面流 copy,零中間檔。
 */
export const multitrackRunner: ToolRunner = async (ctx) => {
  const cfgs = (ctx.spec.params['tracks'] as TrackCfg[] | undefined) ?? []
  const output = String(ctx.spec.params['output'] ?? 'mix')
  const limiter = Boolean(ctx.spec.params['limiter'] ?? true)
  if (cfgs.length === 0) throw new FFmpegError('no track configuration')

  const info = await probeFile(ctx.spec.path)
  if (info.audioStreams.length < cfgs.length) {
    throw new FFmpegError(
      `file has ${info.audioStreams.length} audio track(s), configuration expects ${cfgs.length}`
    )
  }

  const included = cfgs
    .map((cfg, i) => ({ cfg, i }))
    .filter(({ cfg }) => cfg.action !== 'exclude')
  const toNormalize = included.filter(({ cfg }) => cfg.action === 'normalize')
  if (included.length === 0) throw new FFmpegError('all tracks excluded')

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
  const suffix = output === 'mix' ? '_mixed' : '_mtnorm'
  const out = resolveOutputPath(ctx.spec.path, suffix, ext, getSettings())
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
      // 保險限制器:上限 = 全域 TP 目標(UI 旋鈕);僅在混音峰值超標時介入
      const tpCeil = Number(ctx.spec.params['limiterTp'] ?? -1)
      const linear = Math.pow(10, tpCeil / 20).toFixed(6)
      chain += `,alimiter=limit=${linear}:level=false`
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
