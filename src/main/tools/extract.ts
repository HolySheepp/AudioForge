import { probeFile } from '../ffmpeg/probe'
import { resolveOutputPath } from '../output'
import { getSettings } from '../settings'
import { FFmpegError, type ToolRunner } from '../queue'
import { losslessExt, runStage } from './common'
import { resolveTracks } from './tracks'

/** 抽取音軌:預設無損 stream copy 到對應容器;可選轉檔輸出 */
export const extractRunner: ToolRunner = async (ctx) => {
  const mode = String(ctx.spec.params['mode'] ?? 'lossless')
  const info = await probeFile(ctx.spec.path)

  const tracks = resolveTracks(ctx.spec.params['tracks'], info.audioStreams.length)
  if (tracks.length === 0) throw new FFmpegError('no matching audio track')

  const outputs: string[] = []
  const multi = tracks.length > 1

  for (let k = 0; k < tracks.length; k++) {
    const i = tracks[k]
    const stream = info.audioStreams[i]
    const suffix = multi ? `_extracted_track${i + 1}` : '_extracted'

    let ext: string
    let codecArgs: string[]
    switch (mode) {
      case 'wav':
        ext = 'wav'
        codecArgs = ['-c:a', 'pcm_s24le']
        break
      case 'mp3':
        ext = 'mp3'
        codecArgs = ['-c:a', 'libmp3lame', '-b:a', '320k']
        break
      case 'flac':
        ext = 'flac'
        codecArgs = ['-c:a', 'flac', '-compression_level', '5']
        break
      default:
        ext = losslessExt(stream.codec)
        codecArgs = ['-c:a', 'copy']
    }

    const out = resolveOutputPath(ctx.spec.path, suffix, ext, getSettings())
    ctx.trackOutput(out)
    await runStage(
      ctx,
      ['-i', ctx.spec.path, '-map', `0:a:${i}`, ...codecArgs, '-map_metadata', '0', out],
      info.durationSec,
      k / tracks.length,
      (k + 1) / tracks.length
    )
    outputs.push(out)
  }

  return { outputs }
}
