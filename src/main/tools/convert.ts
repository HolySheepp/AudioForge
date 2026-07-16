import { probeFile } from '../ffmpeg/probe'
import { resolveOutputPath } from '../output'
import { getSettings } from '../settings'
import { FFmpegError, type ToolRunner } from '../queue'
import { runStage } from './common'

/** 音訊轉檔:WAV / MP3 / AAC / FLAC;影片輸入 = 取第一音軌 */
export const convertRunner: ToolRunner = async (ctx) => {
  const p = ctx.spec.params
  const format = String(p['format'] ?? 'wav')
  const info = await probeFile(ctx.spec.path)
  if (info.audioStreams.length === 0) throw new FFmpegError('no audio stream')

  let ext: string
  let codecArgs: string[]
  switch (format) {
    case 'mp3':
      ext = 'mp3'
      codecArgs =
        String(p['mp3Mode'] ?? 'cbr') === 'vbr'
          ? ['-c:a', 'libmp3lame', '-q:a', String(p['mp3VbrQuality'] ?? 0)]
          : ['-c:a', 'libmp3lame', '-b:a', `${Number(p['mp3Bitrate'] ?? 320)}k`]
      break
    case 'aac':
      ext = 'm4a'
      codecArgs = ['-c:a', 'aac', '-b:a', `${Number(p['aacBitrate'] ?? 256)}k`]
      break
    case 'flac':
      ext = 'flac'
      codecArgs = ['-c:a', 'flac', '-compression_level', '5']
      break
    default: {
      ext = 'wav'
      const depth = String(p['wavDepth'] ?? '24')
      const codec = depth === '16' ? 'pcm_s16le' : depth === '32f' ? 'pcm_f32le' : 'pcm_s24le'
      codecArgs = ['-c:a', codec]
    }
  }

  const args = ['-i', ctx.spec.path, '-map', '0:a:0', '-vn', ...codecArgs]
  const sr = Number(p['sampleRate'] ?? 0)
  if (sr > 0) args.push('-ar', String(sr))
  const ch = Number(p['channels'] ?? 0)
  if (ch > 0) args.push('-ac', String(ch))
  args.push('-map_metadata', '0')

  const out = resolveOutputPath(ctx.spec.path, '_converted', ext, getSettings())
  ctx.trackOutput(out)
  await runStage(ctx, [...args, out], info.durationSec, 0, 1)
  return { outputs: [out] }
}
