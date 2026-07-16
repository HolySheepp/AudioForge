/**
 * 端到端冒煙測試(AUDIOFORGE_SMOKE=1 時執行,不開視窗):
 * 自產測試媒體 → 走真實佇列跑六功能 → ffprobe / ebur128 驗證輸出 → exit 0/1
 */
import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { ffmpegPath } from './ffmpeg/paths'
import { probeFile } from './ffmpeg/probe'
import { queue } from './queue'
import { registerAllTools } from './tools'
import { parseEbur128Summary } from './tools/common'
import { hapticTest } from './haptics'
import type { JobSpec, JobUpdate } from '../shared/types'

const execFileAsync = promisify(execFile)
const dir = join(app.getPath('temp'), 'audioforge-smoke')

let failures = 0

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function ff(args: string[]): Promise<void> {
  await execFileAsync(ffmpegPath, ['-hide_banner', '-v', 'error', '-y', ...args], {
    windowsHide: true,
    timeout: 120000
  })
}

async function measureLufs(path: string): Promise<number> {
  const { stderr } = await execFileAsync(
    ffmpegPath,
    ['-hide_banner', '-i', path, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', 'NUL'],
    { windowsHide: true, timeout: 120000, maxBuffer: 32 * 1024 * 1024 }
  ).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }))
  const r = parseEbur128Summary(stderr)
  return r ? r.integrated : NaN
}

/** 跑一個 job 並等它結束 */
function runJob(spec: JobSpec): Promise<JobUpdate> {
  return new Promise((resolve) => {
    queue.setOnUpdate((u) => {
      if (u.jobId !== spec.jobId) return
      if (u.status === 'done' || u.status === 'failed' || u.status === 'cancelled') resolve(u)
    })
    queue.enqueue([spec])
  })
}

let seq = 1
const spec = (tool: JobSpec['tool'], path: string, params: Record<string, unknown>): JobSpec => ({
  jobId: `smoke-${seq++}`,
  itemId: `it-${seq}`,
  tool,
  path,
  params
})

export async function runSmoke(): Promise<void> {
  registerAllTools()
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  console.log(`smoke dir: ${dir}`)

  // ---- 產生測試媒體 ----
  const wavA = join(dir, 'toneA.wav') // 440Hz,約 -20 LUFS 上下
  const wavB = join(dir, 'toneB.wav')
  const video = join(dir, 'video.mp4') // testsrc2 + 兩條 AAC 音軌(遊戲軌/麥克風軌模擬)
  await ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-af', 'volume=0.3', '-ar', '48000', wavA])
  await ff(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=8', '-af', 'volume=0.08', '-ar', '48000', wavB])
  await ff([
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=880:duration=8',
    '-map', '0:v', '-map', '1:a', '-map', '2:a',
    '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'aac', '-b:a', '192k',
    video
  ])
  check('test media generated', existsSync(wavA) && existsSync(video))

  // ---- 1. analysis ----
  const a1 = await runJob(spec('analysis', wavA, {}))
  check(
    'analysis',
    a1.status === 'done' && Number.isFinite(a1.analysis?.integrated ?? NaN),
    `I=${a1.analysis?.integrated} TP=${a1.analysis?.truePeak}`
  )

  // ---- 2. normalize(wav → -14 LUFS ±0.5)----
  const n1 = await runJob(spec('normalize', wavA, { lufs: -14, tp: -1 }))
  check('normalize job', n1.status === 'done', n1.errorTail ?? '')
  if (n1.status === 'done' && n1.outputs?.[0]) {
    const lufs = await measureLufs(n1.outputs[0])
    check('normalize target ±0.5', Math.abs(lufs - -14) <= 0.5, `measured ${lufs}`)
    const info = await probeFile(n1.outputs[0])
    check('normalize keeps sample rate', info.audioStreams[0]?.sampleRate === 48000)
  }

  // ---- 3. extract(lossless aac → m4a)----
  const e1 = await runJob(spec('extract', video, { mode: 'lossless', tracks: [0, 1] }))
  check('extract job', e1.status === 'done' && e1.outputs?.length === 2, e1.errorTail ?? '')
  if (e1.outputs?.[0]) {
    const info = await probeFile(e1.outputs[0])
    check('extract stream copy codec', info.audioStreams[0]?.codec === 'aac', info.audioStreams[0]?.codec)
    check('extract container m4a', e1.outputs[0].endsWith('.m4a'))
  }

  // ---- 4. convert(wav → mp3 320)----
  const c1 = await runJob(
    spec('convert', wavA, { format: 'mp3', mp3Mode: 'cbr', mp3Bitrate: 320, sampleRate: 0, channels: 0 })
  )
  check('convert job', c1.status === 'done', c1.errorTail ?? '')
  if (c1.outputs?.[0]) {
    const info = await probeFile(c1.outputs[0])
    check('convert mp3 codec', info.audioStreams[0]?.codec === 'mp3')
  }

  // ---- 5. replace(keepVideo,畫面流 copy)----
  const srcInfo = await probeFile(video)
  const r1 = await runJob(
    spec('replace', video, { replaceAudioPath: wavB, length: 'keepVideo', codec: 'aac' })
  )
  check('replace job', r1.status === 'done', r1.errorTail ?? '')
  if (r1.outputs?.[0]) {
    const info = await probeFile(r1.outputs[0])
    check('replace video codec unchanged', info.videoCodec === srcInfo.videoCodec)
    check('replace single new audio', info.audioStreams.length === 1)
    check(
      'replace duration ≈ video',
      Math.abs((info.durationSec ?? 0) - (srcInfo.durationSec ?? 0)) < 0.5,
      `${info.durationSec} vs ${srcInfo.durationSec}`
    )
  }

  // ---- 6. multitrack(軌1→-20、軌2→-14;mix 與 separate)----
  const mtParams = {
    tracks: [
      { action: 'normalize', lufs: -20, tp: -1 },
      { action: 'normalize', lufs: -14, tp: -1 }
    ],
    output: 'separate',
    limiter: true
  }
  const m1 = await runJob(spec('multitrack', video, mtParams))
  check('multitrack separate job', m1.status === 'done', m1.errorTail ?? '')
  if (m1.outputs?.[0]) {
    const info = await probeFile(m1.outputs[0])
    check('mt separate keeps 2 tracks', info.audioStreams.length === 2)
    check('mt separate video copy', info.videoCodec === srcInfo.videoCodec)
    const { stderr } = await execFileAsync(
      ffmpegPath,
      ['-hide_banner', '-i', m1.outputs[0], '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', 'NUL'],
      { windowsHide: true, timeout: 120000, maxBuffer: 32 * 1024 * 1024 }
    ).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }))
    const t0 = parseEbur128Summary(stderr)?.integrated ?? NaN
    check('mt track1 → -20 ±0.5', Math.abs(t0 - -20) <= 0.5, `measured ${t0}`)
  }

  const m2 = await runJob(spec('multitrack', video, { ...mtParams, output: 'mix' }))
  check('multitrack mix job', m2.status === 'done', m2.errorTail ?? '')
  if (m2.outputs?.[0]) {
    const info = await probeFile(m2.outputs[0])
    check('mt mix single stereo track', info.audioStreams.length === 1 && info.audioStreams[0].channels === 2)
    check('mt mix video copy', info.videoCodec === srcInfo.videoCodec)
  }

  // 資訊性檢查(不列入失敗):HapticWeb 服務是否可達、發送鏈是否正常
  const hapticOk = await hapticTest()
  console.log(`INFO haptic service reachable: ${hapticOk}`)

  console.log(failures === 0 ? 'SMOKE_ALL_PASS' : `SMOKE_FAILURES=${failures}`)
  app.exit(failures === 0 ? 0 : 1)
}
