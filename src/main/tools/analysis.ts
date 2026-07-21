import { probeFile } from '../ffmpeg/probe'
import { getSettings } from '../settings'
import { FFmpegError, type ToolRunner } from '../queue'
import { parseAstatsCrest, parseEbur128Summaries, runStage } from './common'
import { resolveTracks } from './tracks'
import type { TrackAnalysis } from '../../shared/types'

/**
 * 響度分析。只計算設定裡勾選的指標,藉此讓「分析負擔」可調:
 * - lufs / lra / truePeak / plr → 共用一次 ebur128 讀取(plr 為衍生)
 * - crest → 需另跑一次 astats(等於多讀一遍檔案)
 * 全不勾則不讀取。多軌一次讀完:filter_complex 併排各軌,省下重複解碼。
 */
export const analysisRunner: ToolRunner = async (ctx) => {
  const info = await probeFile(ctx.spec.path)
  const tracks = resolveTracks(ctx.spec.params['tracks'], info.audioStreams.length)
  if (tracks.length === 0) throw new FFmpegError('no audio stream')

  const metrics = getSettings().analysisMetrics
  const needEbur = ['lufs', 'lra', 'truePeak', 'plr'].some((m) => metrics.includes(m))
  const needCrest = metrics.includes('crest')

  const result: TrackAnalysis[] = tracks.map((track) => ({ track }))
  const byTrack = new Map(result.map((r) => [r.track, r]))

  // 兩段的進度切分:只有一段時該段獨占 0–1
  let cursor = 0
  const seg = (needEbur ? 1 : 0) + (needCrest ? 1 : 0) || 1

  if (needEbur) {
    const from = cursor / seg
    cursor++
    const parts = tracks.map((i) => `[0:a:${i}]ebur128=peak=true[e${i}]`)
    const args = ['-i', ctx.spec.path, '-filter_complex', parts.join(';')]
    for (const i of tracks) args.push('-map', `[e${i}]`, '-f', 'null', 'NUL')

    const stderr = await runStage(ctx, args, info.durationSec, from, cursor / seg)
    const summaries = parseEbur128Summaries(stderr)
    if (summaries.length < tracks.length) throw new FFmpegError(stderr.slice(-3000))
    tracks.forEach((track, k) => {
      const r = byTrack.get(track)!
      r.integrated = summaries[k].integrated
      r.range = summaries[k].range
      r.truePeak = summaries[k].truePeak
    })
  }

  if (needCrest) {
    const from = cursor / seg
    cursor++
    const aparts = tracks.map((i) => `[0:a:${i}]astats=metadata=0[s${i}]`)
    const aargs = ['-i', ctx.spec.path, '-filter_complex', aparts.join(';')]
    for (const i of tracks) aargs.push('-map', `[s${i}]`, '-f', 'null', 'NUL')
    const astderr = await runStage(ctx, aargs, info.durationSec, from, cursor / seg)
    const crests = parseAstatsCrest(astderr, tracks.length)
    tracks.forEach((track, k) => {
      if (Number.isFinite(crests[k])) byTrack.get(track)!.crest = crests[k]
    })
  }

  return { outputs: [], analysis: result }
}
