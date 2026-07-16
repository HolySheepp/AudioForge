import { execFile } from 'child_process'
import { promisify } from 'util'
import { stat } from 'fs/promises'
import { basename, extname } from 'path'
import { ffprobePath } from './paths'
import type { MediaInfo, AudioStreamInfo } from '../../shared/types'

const execFileAsync = promisify(execFile)

interface FFprobeStream {
  index: number
  codec_type: string
  codec_name?: string
  sample_rate?: string
  channels?: number
  channel_layout?: string
  bit_rate?: string
  width?: number
  height?: number
  tags?: Record<string, string>
  disposition?: Record<string, number>
}

interface FFprobeOutput {
  format?: {
    duration?: string
    format_name?: string
    size?: string
  }
  streams?: FFprobeStream[]
}

export async function probeFile(path: string): Promise<MediaInfo> {
  const [{ stdout }, st] = await Promise.all([
    execFileAsync(
      ffprobePath,
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true }
    ),
    stat(path)
  ])

  const data = JSON.parse(stdout) as FFprobeOutput
  const streams = data.streams ?? []

  const video = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1)
  const audioStreams: AudioStreamInfo[] = streams
    .filter((s) => s.codec_type === 'audio')
    .map((s, i) => ({
      index: i,
      codec: s.codec_name ?? 'unknown',
      sampleRate: Number(s.sample_rate ?? 0),
      channels: s.channels ?? 0,
      channelLayout: s.channel_layout ?? '',
      bitrate: s.bit_rate ? Number(s.bit_rate) : null,
      language: s.tags?.language ?? null,
      title: s.tags?.title ?? null
    }))

  const durationRaw = Number(data.format?.duration)

  return {
    path,
    name: basename(path),
    sizeBytes: st.size,
    durationSec: Number.isFinite(durationRaw) ? durationRaw : null,
    container: (data.format?.format_name ?? extname(path).slice(1)).split(',')[0],
    hasVideo: Boolean(video),
    videoCodec: video?.codec_name ?? null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    audioStreams,
    mtimeMs: st.mtimeMs
  }
}
