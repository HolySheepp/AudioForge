import { runFFmpegCollect } from '../ffmpeg/run'
import { FFmpegError, CancelledError, type JobContext } from '../queue'

/** loudnorm print_format=json 的測量結果 */
export interface LoudnormMeasured {
  input_i: string
  input_tp: string
  input_lra: string
  input_thresh: string
  target_offset: string
}

/** 從 stderr 依序取出所有 loudnorm JSON 區塊(多軌單次測量時順序 = filtergraph 宣告順序) */
export function parseLoudnormBlocks(stderr: string): LoudnormMeasured[] {
  const blocks: LoudnormMeasured[] = []
  const re = /\{[^{}]*"input_i"[^{}]*\}/g
  for (const m of stderr.match(re) ?? []) {
    try {
      blocks.push(JSON.parse(m) as LoudnormMeasured)
    } catch {
      /* 非 JSON 區塊略過 */
    }
  }
  return blocks
}

/** 組出 pass2 的 loudnorm 濾鏡字串(linear=true 純線性增益) */
export function loudnormApply(I: number, TP: number, m: LoudnormMeasured): string {
  return (
    `loudnorm=I=${I}:TP=${TP}:LRA=11` +
    `:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}` +
    `:offset=${m.target_offset}:linear=true`
  )
}

/** ebur128 摘要解析(I / LRA / True peak) */
export function parseEbur128Summary(
  stderr: string
): { integrated: number; range: number; truePeak: number } | null {
  const tail = stderr.slice(stderr.lastIndexOf('Summary:'))
  const i = /I:\s+(-?[\d.]+)\s+LUFS/.exec(tail)
  const lra = /LRA:\s+(-?[\d.]+)\s+LU/.exec(tail)
  const peak = /Peak:\s+(-?[\d.]+)\s+dBFS/.exec(tail)
  if (!i || !lra || !peak) return null
  return { integrated: Number(i[1]), range: Number(lra[1]), truePeak: Number(peak[1]) }
}

/**
 * 執行一段 ffmpeg 並把 out_time 映射為 [from, to] 區間的進度。
 * 非零退出 → FFmpegError;取消 → CancelledError。回傳完整 stderr。
 */
export async function runStage(
  ctx: JobContext,
  args: string[],
  durationSec: number | null,
  from: number,
  to: number
): Promise<string> {
  const { code, stderr, cancelled } = await runFFmpegCollect(
    ['-nostats', '-progress', 'pipe:1', ...args],
    durationSec
      ? (outSec) => {
          const frac = Math.min(1, outSec / durationSec)
          ctx.report({ progress: from + frac * (to - from) })
        }
      : undefined,
    (h) => ctx.register(h)
  )
  if (cancelled || ctx.isCancelled()) throw new CancelledError()
  if (code !== 0) throw new FFmpegError(stderr.slice(-8192))
  ctx.report({ progress: to })
  return stderr
}

/** 抽取:來源音訊 codec → 無損容器副檔名 */
export function losslessExt(codec: string): string {
  if (codec === 'aac') return 'm4a'
  if (codec === 'mp3') return 'mp3'
  if (codec.startsWith('pcm_')) return 'wav'
  if (codec === 'flac') return 'flac'
  if (codec === 'opus' || codec === 'vorbis') return 'ogg'
  return 'mka'
}

/** mp4 家族容器可 stream copy 的音訊 codec */
const MP4_FAMILY = new Set(['mp4', 'm4v', 'mov'])
const MP4_COPY_OK = new Set(['aac', 'mp3', 'ac3', 'eac3', 'alac'])

export function canCopyAudioInto(containerExt: string, audioCodec: string): boolean {
  if (MP4_FAMILY.has(containerExt)) return MP4_COPY_OK.has(audioCodec)
  return true // mkv 等容器幾乎什麼都能裝
}

/** 依來源副檔名決定「同格式輸出」的音訊編碼參數(normalization 用) */
export function sameFormatAudioArgs(ext: string, srcCodec: string, srcBitrate: number | null): string[] {
  switch (ext) {
    case 'wav':
    case 'aiff':
      return ['-c:a', srcCodec.startsWith('pcm_') ? srcCodec : 'pcm_s24le']
    case 'mp3': {
      const kbps = srcBitrate ? Math.min(320, Math.max(128, Math.round(srcBitrate / 1000 / 32) * 32)) : 320
      return ['-c:a', 'libmp3lame', '-b:a', `${kbps}k`]
    }
    case 'flac':
      return ['-c:a', 'flac', '-compression_level', '5']
    case 'm4a':
    case 'aac':
      return ['-c:a', 'aac', '-b:a', '320k']
    case 'ogg':
      return ['-c:a', 'libvorbis', '-q:a', '7']
    case 'opus':
      return ['-c:a', 'libopus', '-b:a', '192k']
    case 'ac3':
      return ['-c:a', 'ac3', '-b:a', srcBitrate ? `${Math.round(srcBitrate / 1000)}k` : '448k']
    case 'wma':
      return ['-c:a', 'wmav2', '-b:a', '192k']
    default:
      return ['-c:a', 'aac', '-b:a', '320k']
  }
}

export function extOf(path: string): string {
  const i = path.lastIndexOf('.')
  return i >= 0 ? path.slice(i + 1).toLowerCase() : ''
}
