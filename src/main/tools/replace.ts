import { probeFile } from '../ffmpeg/probe'
import { resolveOutputPath } from '../output'
import { getSettings } from '../settings'
import { FFmpegError, type ToolRunner } from '../queue'
import { canCopyAudioInto, extOf, runStage } from './common'

/**
 * 音軌替換:視訊/字幕/章節全 copy,只換音軌。
 * keepVideo:-af apad + -shortest(音訊補靜音到影片長度,必然重編音訊)
 * shortest:以較短者為準,音訊可 copy(容器不相容時自動降級 AAC 320k)
 */
export const replaceRunner: ToolRunner = async (ctx) => {
  const audioPath = String(ctx.spec.params['replaceAudioPath'] ?? '')
  if (!audioPath) throw new FFmpegError('no replacement audio assigned')
  const length = String(ctx.spec.params['length'] ?? 'keepVideo')
  const codec = String(ctx.spec.params['codec'] ?? 'aac')

  const [video, audio] = await Promise.all([probeFile(ctx.spec.path), probeFile(audioPath)])
  if (!video.hasVideo) throw new FFmpegError('input has no video stream')
  if (audio.audioStreams.length === 0) throw new FFmpegError('replacement file has no audio')

  const ext = extOf(ctx.spec.path)
  const out = resolveOutputPath(ctx.spec.path, '_replaced', ext, getSettings())
  ctx.trackOutput(out)

  const args = [
    '-i', ctx.spec.path,
    '-i', audioPath,
    '-map', '0', '-map', '-0:a', '-map', '1:a:0',
    '-c', 'copy'
  ]

  if (length === 'keepVideo') {
    // 保留完整影片:音訊墊無限靜音,-shortest 停在影片結尾;必然重編
    args.push('-af', 'apad', '-shortest')
    const usePcm = codec === 'pcm' && pcmOk(ext)
    args.push(...encodeArgs(usePcm ? 'pcm' : 'aac'))
    if (!usePcm && codec !== 'aac') ctx.report({ note: 'downgradedAac' })
  } else {
    args.push('-shortest')
    if (codec === 'copy' && canCopyAudioInto(ext, audio.audioStreams[0].codec)) {
      args.push('-c:a', 'copy')
    } else if (codec === 'pcm' && pcmOk(ext)) {
      args.push(...encodeArgs('pcm'))
    } else {
      // 不相容組合自動降級 AAC 320k,並在任務上註記
      args.push(...encodeArgs('aac'))
      if (codec !== 'aac') ctx.report({ note: 'downgradedAac' })
    }
  }

  args.push('-map_metadata', '0', out)
  await runStage(ctx, args, video.durationSec, 0, 1)
  return { outputs: [out] }
}

/** pcm 只放進 mov / mkv 容器 */
function pcmOk(ext: string): boolean {
  return ext === 'mov' || ext === 'mkv'
}

function encodeArgs(kind: 'aac' | 'pcm'): string[] {
  return kind === 'pcm' ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', '320k']
}
