import { probeFile } from '../ffmpeg/probe'
import { resolveOutputPath } from '../output'
import { getSettings } from '../settings'
import { FFmpegError, type ToolRunner } from '../queue'
import { runStage } from './common'

/**
 * 混音合併:把多個音訊檔混成單一立體聲音軌。
 * 一個 job 收整批輸入(params.inputPaths),輸出一個檔案。
 */
export const mixdownRunner: ToolRunner = async (ctx) => {
  const inputs = (ctx.spec.params['inputPaths'] as string[] | undefined) ?? []
  if (inputs.length < 2) throw new FFmpegError('need at least two audio inputs')

  const format = String(ctx.spec.params['format'] ?? 'wav')
  const autoLevel = Boolean(ctx.spec.params['autoLevel'] ?? false)
  const duration = String(ctx.spec.params['duration'] ?? 'longest')
  const srParam = Number(ctx.spec.params['sampleRate'] ?? 0)
  const limiter = Boolean(ctx.spec.params['limiter'] ?? true)

  const infos = await Promise.all(inputs.map((p) => probeFile(p)))
  for (const info of infos) {
    if (info.audioStreams.length === 0) throw new FFmpegError(`no audio stream: ${info.name}`)
  }
  const durations = infos.map((i) => i.durationSec ?? 0)
  const progressBase =
    duration === 'shortest' ? Math.min(...durations) : Math.max(...durations)
  const sr = srParam > 0 ? srParam : infos[0].audioStreams[0].sampleRate || 48000

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

  const labels = inputs.map((_, i) => `[${i}:a:0]`).join('')
  let chain =
    `${labels}amix=inputs=${inputs.length}:duration=${duration}:normalize=${autoLevel ? 1 : 0}` +
    `,aformat=sample_rates=${sr}:channel_layouts=stereo`
  if (limiter) {
    // 保險限制器:多軌相加峰值超過 -1 dBTP 時介入
    chain += `,alimiter=limit=${Math.pow(10, -1 / 20).toFixed(6)}:level=false`
  }

  const out = resolveOutputPath(inputs[0], '_mixdown', ext, getSettings())
  ctx.trackOutput(out)

  const args: string[] = []
  for (const p of inputs) args.push('-i', p)
  args.push('-filter_complex', `${chain}[mix]`, '-map', '[mix]', ...codecArgs)
  args.push('-map_metadata', '0', out)

  await runStage(ctx, args, progressBase || null, 0, 1)
  return { outputs: [out] }
}
