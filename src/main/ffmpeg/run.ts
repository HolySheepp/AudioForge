import { spawn, type ChildProcess } from 'child_process'
import { ffmpegPath } from './paths'

export interface RunResult {
  code: number
  /** stderr 尾段(最多 ~8KB) */
  stderrTail: string
  cancelled: boolean
}

export interface RunHandle {
  cancel: () => void
  done: Promise<RunResult>
}

const STDERR_TAIL_MAX = 8192

/**
 * 執行 ffmpeg。要拿進度的呼叫端自行在 args 加上 `-progress pipe:1 -nostats`,
 * onProgress 會收到已輸出的秒數。
 *
 * 注意:ffmpeg 的 out_time_ms 實際上是「微秒」(等同 out_time_us 的歷史怪癖)。
 */
export function runFFmpeg(
  args: string[],
  onProgress?: (outSec: number) => void
): RunHandle {
  const child: ChildProcess = spawn(ffmpegPath, ['-hide_banner', '-y', ...args], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stderrTail = ''
  let cancelled = false
  let stdoutBuf = ''

  child.stdout!.on('data', (d: Buffer) => {
    if (!onProgress) return
    stdoutBuf += d.toString()
    let nl: number
    while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, nl).trim()
      stdoutBuf = stdoutBuf.slice(nl + 1)
      if (line.startsWith('out_time_us=') || line.startsWith('out_time_ms=')) {
        const us = Number(line.slice(line.indexOf('=') + 1))
        if (Number.isFinite(us) && us >= 0) onProgress(us / 1e6)
      }
    }
  })

  child.stderr!.on('data', (d: Buffer) => {
    stderrTail = (stderrTail + d.toString()).slice(-STDERR_TAIL_MAX)
  })

  const done = new Promise<RunResult>((resolve) => {
    child.on('error', (err) => {
      resolve({ code: -1, stderrTail: String(err), cancelled })
    })
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stderrTail, cancelled })
    })
  })

  return {
    cancel: () => {
      cancelled = true
      child.kill()
    },
    done
  }
}

/** 執行 ffmpeg 並等待完成,回傳完整 stderr(供解析 loudnorm JSON / ebur128 摘要) */
export async function runFFmpegCollect(
  args: string[],
  onProgress?: (outSec: number) => void,
  register?: (h: RunHandle) => void
): Promise<{ code: number; stderr: string; cancelled: boolean }> {
  const child = spawn(ffmpegPath, ['-hide_banner', '-y', ...args], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stderr = ''
  let cancelled = false
  let stdoutBuf = ''

  child.stdout!.on('data', (d: Buffer) => {
    if (!onProgress) return
    stdoutBuf += d.toString()
    let nl: number
    while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, nl).trim()
      stdoutBuf = stdoutBuf.slice(nl + 1)
      if (line.startsWith('out_time_us=') || line.startsWith('out_time_ms=')) {
        const us = Number(line.slice(line.indexOf('=') + 1))
        if (Number.isFinite(us) && us >= 0) onProgress(us / 1e6)
      }
    }
  })
  child.stderr!.on('data', (d: Buffer) => {
    stderr += d.toString()
    if (stderr.length > 1_000_000) stderr = stderr.slice(-500_000)
  })

  const promise = new Promise<{ code: number; stderr: string; cancelled: boolean }>((resolve) => {
    child.on('error', (err) => resolve({ code: -1, stderr: String(err), cancelled }))
    child.on('close', (code) => resolve({ code: code ?? -1, stderr, cancelled }))
  })

  register?.({
    cancel: () => {
      cancelled = true
      child.kill()
    },
    done: promise.then((r) => ({ code: r.code, stderrTail: r.stderr.slice(-STDERR_TAIL_MAX), cancelled: r.cancelled }))
  })

  return promise
}
