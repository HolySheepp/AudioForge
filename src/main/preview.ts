import { existsSync } from 'fs'
import { probeFile } from './ffmpeg/probe'
import { runFFmpegCollect } from './ffmpeg/run'
import { detectHardware } from './ffmpeg/hardware'
import { getSettings } from './settings'
import { cacheKeyPath } from './cache'

export interface PreviewResult {
  /** media:// URL(直接播或 proxy) */
  url: string
  kind: 'video' | 'audio'
  isProxy: boolean
}

/** 本地路徑 → media:// URL */
export function toMediaUrl(path: string): string {
  return 'media:///' + path.split(/[\\/]/).map(encodeURIComponent).join('/')
}

// Chromium 可直接解碼的組合
const DIRECT_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1'])
const DIRECT_AUDIO_CODECS = new Set([
  'aac', 'mp3', 'flac', 'opus', 'vorbis', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'pcm_u8'
])
const DIRECT_CONTAINERS = new Set(['mp4', 'm4v', 'mov', 'webm', 'matroska', 'mp3', 'wav', 'flac', 'ogg'])

// 同一檔案的 proxy 產生去重
const inflight = new Map<string, Promise<PreviewResult>>()

export async function ensurePreview(
  path: string,
  onProgress?: (frac: number) => void
): Promise<PreviewResult> {
  const info = await probeFile(path)
  const kind: PreviewResult['kind'] = info.hasVideo ? 'video' : 'audio'

  const audio = info.audioStreams[0]
  const audioOk = !audio || DIRECT_AUDIO_CODECS.has(audio.codec)
  const videoOk = !info.hasVideo || DIRECT_VIDEO_CODECS.has(info.videoCodec ?? '')
  const containerOk = DIRECT_CONTAINERS.has(info.container)

  if (audioOk && videoOk && containerOk) {
    return { url: toMediaUrl(path), kind, isProxy: false }
  }

  // 需要 proxy
  const proxyPath = cacheKeyPath(path, info.mtimeMs, 'proxy', info.hasVideo ? 'mp4' : 'm4a')
  if (existsSync(proxyPath)) {
    return { url: toMediaUrl(proxyPath), kind, isProxy: true }
  }

  const existing = inflight.get(proxyPath)
  if (existing) return existing

  const job = generateProxy(path, proxyPath, info.hasVideo, info.durationSec, onProgress)
    .then((): PreviewResult => ({ url: toMediaUrl(proxyPath), kind, isProxy: true }))
    .finally(() => inflight.delete(proxyPath))
  inflight.set(proxyPath, job)
  return job
}

async function generateProxy(
  src: string,
  dst: string,
  hasVideo: boolean,
  durationSec: number | null,
  onProgress?: (frac: number) => void
): Promise<void> {
  let args: string[]
  if (hasVideo) {
    // NVENC 可用時走 GPU;失敗/停用時 libx264 ultrafast
    const hw = await detectHardware()
    const useHw = getSettings().hwAccel !== 'off' && hw.chosenEncoder
    const vcodec = useHw
      ? ['-c:v', hw.chosenEncoder!, ...(hw.chosenEncoder === 'h264_nvenc' ? ['-preset', 'p1'] : [])]
      : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28']
    args = [
      '-i', src,
      '-vf', 'scale=-2:480',
      ...vcodec,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      dst
    ]
  } else {
    args = ['-i', src, '-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k', dst]
  }

  const { code, stderr } = await runFFmpegCollect(
    ['-nostats', '-progress', 'pipe:1', ...args],
    durationSec && onProgress ? (sec) => onProgress(Math.min(1, sec / durationSec)) : undefined
  )
  if (code !== 0) throw new Error(stderr.slice(-2000))
}
