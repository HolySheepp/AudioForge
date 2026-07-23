import { probeFile } from '../ffmpeg/probe'
import { resolveOutputPath } from '../output'
import { getSettings } from '../settings'
import { FFmpegError, type ToolRunner } from '../queue'
import { extOf, runStage, truePeakLimiter } from './common'
import type { MediaInfo } from '../../shared/types'

interface TrackRef {
  path: string
  track: number
}

/**
 * 混音:把「湯底」音軌與一或多個「材料」音軌合成一軌。
 *
 * 輸出型態跟著湯底走:
 * - 湯底屬於影片檔案 → 輸出整部影片,畫面與其餘音軌 copy,只有湯底那條軌被混音結果取代
 * - 湯底是純音訊檔 → 輸出一個新的音訊檔(材料可以來自任何檔案,包括影片裡的某條軌)
 *
 * 一個 job = 一張混音卡,彼此獨立、可平行跑(受全域並行上限限制)。
 */
export const mixdownRunner: ToolRunner = async (ctx) => {
  const base = ctx.spec.params['base'] as TrackRef | undefined
  const ingredients = (ctx.spec.params['ingredients'] as TrackRef[] | undefined) ?? []
  if (!base) throw new FFmpegError('no base track assigned')
  if (ingredients.length === 0) throw new FFmpegError('need at least one ingredient track')

  const autoLevel = Boolean(ctx.spec.params['autoLevel'] ?? false)
  const limiter = Boolean(ctx.spec.params['limiter'] ?? true)
  const duration = String(ctx.spec.params['duration'] ?? 'longest')

  // 去重輸入檔;base 排第一個 → input index 固定為 0,filter 標籤好推算
  const paths: string[] = []
  for (const p of [base.path, ...ingredients.map((i) => i.path)]) {
    if (!paths.includes(p)) paths.push(p)
  }
  const idxOf = (p: string): number => paths.indexOf(p)

  const infoByPath = new Map<string, MediaInfo>(
    await Promise.all(paths.map(async (p): Promise<[string, MediaInfo]> => [p, await probeFile(p)]))
  )
  const baseInfo = infoByPath.get(base.path)!
  const baseStream = baseInfo.audioStreams[base.track]
  if (!baseStream) throw new FFmpegError('base track not found')

  const isVideoBase = baseInfo.hasVideo
  const sr = isVideoBase
    ? baseStream.sampleRate || 48000
    : Number(ctx.spec.params['sampleRate'] ?? 0) || baseStream.sampleRate || 48000

  const baseLabel = `[${idxOf(base.path)}:a:${base.track}]`
  const ingLabels = ingredients.map((i) => `[${idxOf(i.path)}:a:${i.track}]`)
  const n = 1 + ingredients.length
  let chain =
    `${baseLabel}${ingLabels.join('')}amix=inputs=${n}:duration=${duration}:normalize=${autoLevel ? 1 : 0}` +
    `,aformat=sample_rates=${sr}:channel_layouts=stereo`
  if (limiter) chain += truePeakLimiter(-1, sr)

  const args = paths.flatMap((p) => ['-i', p])
  const durations = [...infoByPath.values()].map((i) => i.durationSec ?? 0)
  const progressDur = duration === 'shortest' ? Math.min(...durations) : Math.max(...durations)
  // 同檔案的不同軌可能各是不同混音卡的湯底,彼此平行跑;輸出檔名帶軌號避免撞名
  // (resolveOutputPath 只在呼叫當下查檔案是否存在,平行工作在都還沒寫檔前會算出同一個候選名)
  const trackSuffix = baseInfo.audioStreams.length > 1 ? `_track${base.track + 1}` : ''

  if (isVideoBase) {
    const ext = extOf(base.path)
    const out = resolveOutputPath(base.path, `_mixed${trackSuffix}`, ext, getSettings())
    ctx.trackOutput(out)

    const baseIdx = idxOf(base.path)
    args.push('-filter_complex', `${chain}[mix]`)
    args.push('-map', `${baseIdx}:v?`, '-c:v', 'copy')
    baseInfo.audioStreams.forEach((_, i) => {
      if (i === base.track) args.push('-map', '[mix]', `-c:a:${i}`, 'aac', `-b:a:${i}`, '320k')
      else args.push('-map', `${baseIdx}:a:${i}`, `-c:a:${i}`, 'copy')
    })
    args.push('-map', `${baseIdx}:s?`, '-c:s', 'copy')
    args.push('-map_metadata', String(baseIdx), out)

    await runStage(ctx, args, progressDur || null, 0, 1)
    return { outputs: [out] }
  }

  const format = String(ctx.spec.params['format'] ?? 'wav')
  let ext: string
  let codecArgs: string[]
  switch (format) {
    case 'mp3':
      ext = 'mp3'
      codecArgs = ['-c:a', 'libmp3lame', '-b:a', '320k']
      break
    case 'aac':
      ext = 'm4a'
      codecArgs = ['-c:a', 'aac', '-b:a', '256k']
      break
    case 'flac':
      ext = 'flac'
      codecArgs = ['-c:a', 'flac', '-compression_level', '5']
      break
    default:
      ext = 'wav'
      codecArgs = ['-c:a', 'pcm_s24le']
  }

  const out = resolveOutputPath(base.path, `_mixdown${trackSuffix}`, ext, getSettings())
  ctx.trackOutput(out)
  args.push(
    '-filter_complex', `${chain}[mix]`,
    '-map', '[mix]', ...codecArgs,
    '-map_metadata', String(idxOf(base.path)),
    out
  )
  await runStage(ctx, args, progressDur || null, 0, 1)
  return { outputs: [out] }
}
