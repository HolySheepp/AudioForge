import { execFile } from 'child_process'
import { promisify } from 'util'
import { ffmpegPath } from './paths'
import type { HardwareInfo } from '../../shared/types'

const execFileAsync = promisify(execFile)

// 依優先序試編;列在 -encoders ≠ 驅動實際可用,必須真實試編驗證
const CANDIDATES = ['h264_nvenc', 'h264_qsv', 'h264_amf'] as const

let cached: Promise<HardwareInfo> | null = null

export function detectHardware(): Promise<HardwareInfo> {
  if (!cached) cached = doDetect()
  return cached
}

async function doDetect(): Promise<HardwareInfo> {
  const [encoderList, gpuNames] = await Promise.all([listEncoders(), listGpus()])

  const present = {
    nvenc: encoderList.includes('h264_nvenc'),
    qsv: encoderList.includes('h264_qsv'),
    amf: encoderList.includes('h264_amf')
  }

  let chosen: string | null = null
  for (const enc of CANDIDATES) {
    if (!encoderList.includes(enc)) continue
    if (await testEncode(enc)) {
      chosen = enc
      break
    }
  }

  return { gpuNames, ...present, chosenEncoder: chosen }
}

async function listEncoders(): Promise<string> {
  try {
    const { stdout } = await execFileAsync(ffmpegPath, ['-hide_banner', '-encoders'], {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    })
    return stdout
  } catch {
    return ''
  }
}

async function testEncode(encoder: string): Promise<boolean> {
  try {
    await execFileAsync(
      ffmpegPath,
      ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.1',
       '-frames:v', '3', '-c:v', encoder, '-f', 'null', '-'],
      { windowsHide: true, timeout: 15000 }
    )
    return true
  } catch {
    return false
  }
}

async function listGpus(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command',
       '(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join "`n"'],
      { windowsHide: true, timeout: 15000 }
    )
    return stdout.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}
