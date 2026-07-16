import { probeFile } from '../ffmpeg/probe'
import { resolveOutputPath } from '../output'
import { getSettings } from '../settings'
import { FFmpegError, type ToolRunner } from '../queue'
import { extOf, loudnormApply, parseLoudnormBlocks, runStage, sameFormatAudioArgs } from './common'

/**
 * 兩段式響度標準化。
 * 音訊檔 → 同格式輸出;影片檔 → 視訊流 copy、只重編第一音軌。
 */
export const normalizeRunner: ToolRunner = async (ctx) => {
  const I = Number(ctx.spec.params['lufs'] ?? -14)
  const TP = Number(ctx.spec.params['tp'] ?? -1)
  const info = await probeFile(ctx.spec.path)
  const audio = info.audioStreams[0]
  if (!audio) throw new FFmpegError('no audio stream')

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
  const filter = loudnormApply(I, TP, measured)
  const ext = extOf(ctx.spec.path)
  const out = resolveOutputPath(ctx.spec.path, '_normalized', ext, getSettings())
  ctx.trackOutput(out)

  const args = info.hasVideo
    ? [
        '-i', ctx.spec.path,
        '-map', '0:v?', '-map', '0:a:0', '-map', '0:s?',
        '-c:v', 'copy', '-c:s', 'copy',
        '-af', filter,
        '-ar', String(audio.sampleRate || 48000),
        ...(audio.codec.startsWith('pcm_')
          ? ['-c:a', audio.codec]
          : ['-c:a', 'aac', '-b:a', '320k']),
        '-map_metadata', '0',
        out
      ]
    : [
        '-i', ctx.spec.path,
        '-map', '0:a:0',
        '-af', filter,
        '-ar', String(audio.sampleRate || 48000),
        ...sameFormatAudioArgs(ext, audio.codec, audio.bitrate),
        '-map_metadata', '0',
        out
      ]

  await runStage(ctx, args, info.durationSec, 0.5, 1)
  return { outputs: [out] }
}
