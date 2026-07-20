import { probeFile } from '../ffmpeg/probe'
import { resolveOutputPath } from '../output'
import { getSettings } from '../settings'
import { FFmpegError, type ToolRunner } from '../queue'
import { canCopyAudioInto, extOf, runStage } from './common'

/**
 * 音軌替換:視訊/字幕/章節全 copy,只換音軌。
 *
 * targetTrack = -1 換掉全部音軌(輸出只剩新音軌);>= 0 則只換掉該軌,
 * 其餘音軌原位 copy 保留,軌序不變。
 *
 * keepVideo:apad + -shortest(音訊補靜音到影片長度,必然重編音訊)
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

  const count = video.audioStreams.length
  const rawTarget = Number(ctx.spec.params['targetTrack'] ?? 0)
  // 軌序越界(批次裡軌數較少的檔案)一律退回「換掉全部」,不要默默換錯軌
  const target = rawTarget >= 0 && rawTarget < count ? rawTarget : -1

  const ext = extOf(ctx.spec.path)
  const out = resolveOutputPath(ctx.spec.path, '_replaced', ext, getSettings())
  ctx.trackOutput(out)

  const args = ['-i', ctx.spec.path, '-i', audioPath, '-map', '0:v?']

  // 音軌映射:保持原軌序,只把 target 那一軌換成新檔的音訊
  // newIdx = 新音軌在「輸出」裡的音訊流序號,-c:a:N / -filter:a:N 都要用它
  let newIdx = 0
  if (target < 0) {
    args.push('-map', '1:a:0')
  } else {
    for (let i = 0; i < count; i++) {
      if (i === target) {
        args.push('-map', '1:a:0')
        newIdx = i
      } else {
        args.push('-map', `0:a:${i}`)
      }
    }
  }
  args.push('-map', '0:s?', '-c:v', 'copy', '-c:s', 'copy')

  // 未被替換的原音軌一律 copy
  if (target >= 0) {
    for (let i = 0; i < count; i++) {
      if (i !== target) args.push(`-c:a:${i}`, 'copy')
    }
  }

  const usePcm = codec === 'pcm' && pcmOk(ext)
  if (length === 'keepVideo') {
    // 保留完整影片:新音軌墊無限靜音,-shortest 停在影片結尾;必然重編
    args.push(`-filter:a:${newIdx}`, 'apad', '-shortest')
    args.push(...encodeArgs(usePcm ? 'pcm' : 'aac', newIdx))
    if (!usePcm && codec !== 'aac') ctx.report({ note: 'downgradedAac' })
  } else {
    args.push('-shortest')
    if (codec === 'copy' && canCopyAudioInto(ext, audio.audioStreams[0].codec)) {
      args.push(`-c:a:${newIdx}`, 'copy')
    } else if (usePcm) {
      args.push(...encodeArgs('pcm', newIdx))
    } else {
      // 不相容組合自動降級 AAC 320k,並在任務上註記
      args.push(...encodeArgs('aac', newIdx))
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

function encodeArgs(kind: 'aac' | 'pcm', idx: number): string[] {
  return kind === 'pcm'
    ? [`-c:a:${idx}`, 'pcm_s16le']
    : [`-c:a:${idx}`, 'aac', `-b:a:${idx}`, '320k']
}
