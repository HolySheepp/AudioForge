import { probeFile } from '../ffmpeg/probe'
import { FFmpegError, type ToolRunner } from '../queue'
import { parseEbur128Summaries, runStage } from './common'
import { resolveTracks } from './tracks'

/**
 * 響度分析:ebur128(true peak 模式),不產生輸出檔。
 * 多軌一次讀完——filter_complex 併排各軌的 ebur128,省下重複解碼。
 */
export const analysisRunner: ToolRunner = async (ctx) => {
  const info = await probeFile(ctx.spec.path)
  const tracks = resolveTracks(ctx.spec.params['tracks'], info.audioStreams.length)
  if (tracks.length === 0) throw new FFmpegError('no audio stream')

  const parts = tracks.map((i) => `[0:a:${i}]ebur128=peak=true[e${i}]`)
  const args = ['-i', ctx.spec.path, '-filter_complex', parts.join(';')]
  for (const i of tracks) args.push('-map', `[e${i}]`, '-f', 'null', 'NUL')

  const stderr = await runStage(ctx, args, info.durationSec, 0, 1)
  const summaries = parseEbur128Summaries(stderr)
  if (summaries.length < tracks.length) throw new FFmpegError(stderr.slice(-3000))

  return {
    outputs: [],
    analysis: tracks.map((track, k) => ({ track, ...summaries[k] }))
  }
}
