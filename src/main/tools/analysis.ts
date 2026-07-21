import { probeFile } from '../ffmpeg/probe'
import { getSettings } from '../settings'
import { FFmpegError, type ToolRunner } from '../queue'
import { parseAstatsCrest, parseEbur128Summaries, runStage } from './common'
import { resolveTracks } from './tracks'
import type { TrackAnalysis } from '../../shared/types'

/**
 * 響度分析:ebur128(true peak 模式),不產生輸出檔。
 * 多軌一次讀完——filter_complex 併排各軌的 ebur128,省下重複解碼。
 * 若設定啟用 crest,再跑一次 astats(僅此指標需要,故做成第二遍以簡化解析)。
 */
export const analysisRunner: ToolRunner = async (ctx) => {
  const info = await probeFile(ctx.spec.path)
  const tracks = resolveTracks(ctx.spec.params['tracks'], info.audioStreams.length)
  if (tracks.length === 0) throw new FFmpegError('no audio stream')

  const wantCrest = getSettings().analysisMetrics.includes('crest')
  const eburEnd = wantCrest ? 0.7 : 1

  // Pass 1:ebur128(I / LRA / True peak)
  const parts = tracks.map((i) => `[0:a:${i}]ebur128=peak=true[e${i}]`)
  const args = ['-i', ctx.spec.path, '-filter_complex', parts.join(';')]
  for (const i of tracks) args.push('-map', `[e${i}]`, '-f', 'null', 'NUL')

  const stderr = await runStage(ctx, args, info.durationSec, 0, eburEnd)
  const summaries = parseEbur128Summaries(stderr)
  if (summaries.length < tracks.length) throw new FFmpegError(stderr.slice(-3000))

  const result: TrackAnalysis[] = tracks.map((track, k) => ({ track, ...summaries[k] }))

  // Pass 2(選配):astats → crest
  if (wantCrest) {
    const aparts = tracks.map((i) => `[0:a:${i}]astats=metadata=0[s${i}]`)
    const aargs = ['-i', ctx.spec.path, '-filter_complex', aparts.join(';')]
    for (const i of tracks) aargs.push('-map', `[s${i}]`, '-f', 'null', 'NUL')
    const astderr = await runStage(ctx, aargs, info.durationSec, 0.7, 1)
    const crests = parseAstatsCrest(astderr, tracks.length)
    result.forEach((r, k) => {
      if (Number.isFinite(crests[k])) r.crest = crests[k]
    })
  }

  return { outputs: [], analysis: result }
}
