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
import { parseEbur128Summaries } from './tools/common'
import { updateSettings } from './settings'
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
  const [r] = parseEbur128Summaries(stderr)
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
  // 兩條音軌用寬頻內容(粉紅噪 / 鋸齒),而非正弦——正弦頻帶受限、幾乎沒有
  // inter-sample peak,無法驗證混音真峰值限制器。音量刻意差一截(供逐軌測量比對)
  await ff([
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=8',
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=8:sample_rate=48000:amplitude=0.5',
    '-f', 'lavfi', '-i', 'aevalsrc=0.5*mod(t*300\\,1):duration=8:sample_rate=48000',
    '-filter_complex', '[1:a]volume=0.30[a1];[2:a]volume=0.06[a2]',
    '-map', '0:v', '-map', '[a1]', '-map', '[a2]',
    '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'aac', '-b:a', '192k',
    video
  ])
  check('test media generated', existsSync(wavA) && existsSync(video))

  // ---- 1. analysis(單軌 + 影片雙軌逐軌)----
  const a1 = await runJob(spec('analysis', wavA, {}))
  const a1t = a1.analysis?.[0]
  check(
    'analysis',
    a1.status === 'done' && a1.analysis?.length === 1 && Number.isFinite(a1t?.integrated ?? NaN),
    `I=${a1t?.integrated} TP=${a1t?.truePeak}`
  )

  const a2 = await runJob(spec('analysis', video, { tracks: [0, 1] }))
  check(
    'analysis per-track (2 tracks)',
    a2.status === 'done' && a2.analysis?.length === 2,
    a2.analysis?.map((x) => `t${x.track}:${x.integrated?.toFixed(1)}`).join(' ') ?? (a2.errorTail ?? '')
  )
  if (a2.analysis?.length === 2) {
    // 兩軌音量刻意不同(440Hz 較大、880Hz 較小),逐軌測量必須測出差異
    const i0 = a2.analysis[0].integrated ?? NaN
    const i1 = a2.analysis[1].integrated ?? NaN
    check('analysis tracks differ', Math.abs(i0 - i1) > 1, `${i0} vs ${i1}`)
  }

  // crest(astats)逐軌解析:啟用後兩軌各有有限 crest,且順序正確對應
  updateSettings({ analysisMetrics: ['lufs', 'lra', 'truePeak', 'plr', 'crest'] })
  const ac = await runJob(spec('analysis', video, { tracks: [0, 1] }))
  check(
    'analysis crest per-track',
    ac.analysis?.length === 2 &&
      Number.isFinite(ac.analysis[0].crest ?? NaN) &&
      Number.isFinite(ac.analysis[1].crest ?? NaN),
    ac.analysis?.map((x) => `t${x.track}:crest ${x.crest?.toFixed(1)}`).join(' ') ?? (ac.errorTail ?? '')
  )
  // 只勾 crest → 跳過 ebur128,integrated 應為空(證明取消勾選真的省一遍讀取)
  updateSettings({ analysisMetrics: ['crest'] })
  const acOnly = await runJob(spec('analysis', video, { tracks: [0] }))
  check(
    'analysis crest-only skips ebur',
    acOnly.analysis?.[0]?.integrated == null && Number.isFinite(acOnly.analysis?.[0]?.crest ?? NaN),
    `integrated=${acOnly.analysis?.[0]?.integrated} crest=${acOnly.analysis?.[0]?.crest}`
  )
  updateSettings({ analysisMetrics: ['lufs', 'lra', 'truePeak', 'plr'] })

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

  // 影片雙軌 → 每軌各輸出一個檔
  const c2 = await runJob(
    spec('convert', video, { format: 'wav', wavDepth: '24', sampleRate: 0, channels: 0, tracks: [0, 1] })
  )
  check('convert per-track job', c2.status === 'done' && c2.outputs?.length === 2, c2.errorTail ?? '')
  if (c2.outputs?.[0]) {
    const info = await probeFile(c2.outputs[0])
    check('convert per-track wav 24-bit', info.audioStreams[0]?.codec === 'pcm_s24le')
    check('convert per-track has no video', !info.hasVideo)
  }

  // ---- 4.5 mixdown(兩個 wav 混成一軌)----
  const mx = await runJob(
    spec('mixdown', wavA, {
      inputPaths: [wavA, wavB],
      format: 'wav',
      autoLevel: false,
      duration: 'longest',
      sampleRate: 0,
      limiter: true
    })
  )
  check('mixdown job', mx.status === 'done', mx.errorTail ?? '')
  if (mx.outputs?.[0]) {
    const info = await probeFile(mx.outputs[0])
    check('mixdown stereo', info.audioStreams[0]?.channels === 2)
    check('mixdown wav 24-bit', info.audioStreams[0]?.codec === 'pcm_s24le', info.audioStreams[0]?.codec)
    check('mixdown keeps sample rate', info.audioStreams[0]?.sampleRate === 48000)
  }

  // ---- 5. replace(keepVideo,畫面流 copy)----
  const srcInfo = await probeFile(video)
  const r1 = await runJob(
    spec('replace', video, {
      replaceAudioPath: wavB,
      length: 'keepVideo',
      codec: 'aac',
      targetTrack: -1
    })
  )
  check('replace job', r1.status === 'done', r1.errorTail ?? '')
  if (r1.outputs?.[0]) {
    const info = await probeFile(r1.outputs[0])
    check('replace video codec unchanged', info.videoCodec === srcInfo.videoCodec)
    check('replace all → single new audio', info.audioStreams.length === 1)
    check(
      'replace duration ≈ video',
      Math.abs((info.durationSec ?? 0) - (srcInfo.durationSec ?? 0)) < 0.5,
      `${info.durationSec} vs ${srcInfo.durationSec}`
    )
  }

  // replace 指定單軌:只換掉軌 2,軌 1 原封不動保留
  const r2 = await runJob(
    spec('replace', video, {
      replaceAudioPath: wavB,
      length: 'keepVideo',
      codec: 'aac',
      targetTrack: 1
    })
  )
  check('replace target-track job', r2.status === 'done', r2.errorTail ?? '')
  if (r2.outputs?.[0]) {
    const info = await probeFile(r2.outputs[0])
    check('replace target keeps track count', info.audioStreams.length === 2, `${info.audioStreams.length}`)
    check('replace target video copy', info.videoCodec === srcInfo.videoCodec)
  }

  // ---- 6. normalize 逐軌(軌1→-20、軌2→-14;mix 與 separate)----
  const mtParams = {
    tracks: [
      { action: 'normalize', lufs: -20, tp: -1 },
      { action: 'normalize', lufs: -14, tp: -1 }
    ],
    output: 'separate',
    limiter: true
  }
  const m1 = await runJob(spec('normalize', video, mtParams))
  check('normalize per-track separate job', m1.status === 'done', m1.errorTail ?? '')
  if (m1.outputs?.[0]) {
    const info = await probeFile(m1.outputs[0])
    check('mt separate keeps 2 tracks', info.audioStreams.length === 2)
    check('mt separate video copy', info.videoCodec === srcInfo.videoCodec)
    const { stderr } = await execFileAsync(
      ffmpegPath,
      ['-hide_banner', '-i', m1.outputs[0], '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', 'NUL'],
      { windowsHide: true, timeout: 120000, maxBuffer: 32 * 1024 * 1024 }
    ).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }))
    const t0 = parseEbur128Summaries(stderr)[0]?.integrated ?? NaN
    check('mt track1 → -20 ±0.5', Math.abs(t0 - -20) <= 0.5, `measured ${t0}`)
  }

  // 混音真峰值:兩軌都推到 -9 LUFS 逼混音過載(未修版本會超過 -1),
  // 驗證超取樣真峰值限制器真的守住天花板。用正弦素材無法驗——故前面改成寬頻音軌
  const loudMix = {
    tracks: [
      { action: 'normalize', lufs: -9, tp: -1 },
      { action: 'normalize', lufs: -9, tp: -1 }
    ],
    output: 'mix',
    limiter: true,
    limiterTp: -1
  }
  const m2 = await runJob(spec('normalize', video, loudMix))
  check('normalize per-track mix job', m2.status === 'done', m2.errorTail ?? '')
  if (m2.outputs?.[0]) {
    const info = await probeFile(m2.outputs[0])
    check('mt mix single stereo track', info.audioStreams.length === 1 && info.audioStreams[0].channels === 2)
    check('mt mix video copy', info.videoCodec === srcInfo.videoCodec)
    // 混音後真峰值必須守住天花板(alimiter 是 sample-peak,得靠超取樣壓 true peak)
    const { stderr } = await execFileAsync(
      ffmpegPath,
      ['-hide_banner', '-i', m2.outputs[0], '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', 'NUL'],
      { windowsHide: true, timeout: 120000, maxBuffer: 32 * 1024 * 1024 }
    ).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }))
    const tp = parseEbur128Summaries(stderr)[0]?.truePeak ?? NaN
    check('mt mix true peak ≤ -1 dBTP', tp <= -1, `measured ${tp}`)
  }

  // 資訊性檢查(不列入失敗):HapticWeb 服務是否可達、發送鏈是否正常
  const hapticOk = await hapticTest()
  console.log(`INFO haptic service reachable: ${hapticOk}`)

  console.log(failures === 0 ? 'SMOKE_ALL_PASS' : `SMOKE_FAILURES=${failures}`)
  app.exit(failures === 0 ? 0 : 1)
}
