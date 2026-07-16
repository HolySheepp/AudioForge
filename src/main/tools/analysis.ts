import { probeFile } from '../ffmpeg/probe'
import { FFmpegError, type ToolRunner } from '../queue'
import { parseEbur128Summary, runStage } from './common'

/** 響度分析:ebur128(true peak 模式),不產生輸出檔 */
export const analysisRunner: ToolRunner = async (ctx) => {
  const info = await probeFile(ctx.spec.path)
  const stderr = await runStage(
    ctx,
    ['-i', ctx.spec.path, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', 'NUL'],
    info.durationSec,
    0,
    1
  )
  const result = parseEbur128Summary(stderr)
  if (!result) throw new FFmpegError(stderr.slice(-2000))
  return { outputs: [], analysis: result }
}
