import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { ffmpegPath } from './ffmpeg/paths'
import { cacheKeyPath } from './cache'

const BUCKETS = 2000

/**
 * 波形 peaks:不用 WebAudio(格式受限),由 ffmpeg 解出 4kHz 單聲道 PCM,
 * 折算成 BUCKETS 組 [min,max](-1..1),以檔案路徑+mtime 快取。
 */
export async function getWaveform(path: string, mtimeMs: number): Promise<number[]> {
  const cacheFile = cacheKeyPath(path, mtimeMs, 'wave', 'json')
  if (existsSync(cacheFile)) {
    try {
      return JSON.parse(readFileSync(cacheFile, 'utf-8')) as number[]
    } catch {
      /* 壞快取重算 */
    }
  }

  const pcm = await decodePcm(path)
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const peaks = new Array<number>(BUCKETS * 2).fill(0)
  const per = Math.max(1, Math.floor(samples.length / BUCKETS))

  for (let b = 0; b < BUCKETS; b++) {
    let min = 0
    let max = 0
    const start = b * per
    const end = Math.min(samples.length, start + per)
    for (let i = start; i < end; i++) {
      const v = samples[i]
      if (v < min) min = v
      if (v > max) max = v
    }
    peaks[b * 2] = min / 32768
    peaks[b * 2 + 1] = max / 32768
  }

  try {
    writeFileSync(cacheFile, JSON.stringify(peaks))
  } catch {
    /* 快取寫入失敗不致命 */
  }
  return peaks
}

function decodePcm(path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ['-hide_banner', '-v', 'error', '-i', path, '-map', '0:a:0', '-ac', '1', '-ar', '4000', '-f', 's16le', '-'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    const chunks: Buffer[] = []
    let err = ''
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', (d: Buffer) => {
      err = (err + d.toString()).slice(-2000)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks))
      else reject(new Error(err || `ffmpeg exit ${code}`))
    })
  })
}
