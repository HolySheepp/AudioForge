/**
 * MX Master 4 觸覺回饋(經 Logi Options+ 的 HapticWeb 外掛)。
 * 本機服務:https://local.jmw.nz:41443(只綁 127.0.0.1)。
 * 服務不存在時完全靜默;不影響沒有此滑鼠/外掛的環境。
 */
import { request, Agent } from 'https'
import { getSettings } from './settings'

// 服務只綁 127.0.0.1;直連 IP 避免依賴 local.jmw.nz 的 DNS 解析,Host 標頭照給
const HOST = '127.0.0.1'
const HOST_HEADER = 'local.jmw.nz'
const PORT = 41443
// 只對這個本機回環服務放寬憑證驗證(外掛用的憑證不一定被系統信任)
const agent = new Agent({ keepAlive: true, rejectUnauthorized: false })

const RETRY_MS = 30_000
/** 快速轉旋鈕時的節流下限 */
const MIN_INTERVAL_MS = 15

let waveforms: string[] = []
let state: 'idle' | 'ready' | 'unavailable' = 'idle'
let lastProbe = 0
let lastSend = 0
let probing: Promise<boolean> | null = null

function httpJson(method: string, path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: HOST,
        port: PORT,
        path,
        method,
        agent,
        timeout: 1500,
        headers: { Host: HOST_HEADER, 'Content-Length': 0 }
      },
      (res) => {
        let body = ''
        res.on('data', (d) => (body += d))
        res.on('end', () => {
          if ((res.statusCode ?? 500) >= 400) return reject(new Error(`HTTP ${res.statusCode}`))
          try {
            resolve(body ? JSON.parse(body) : null)
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.end()
  })
}

/** 探測服務並取得波形清單;結果快取,失敗後 30 秒內不重試 */
function probe(): Promise<boolean> {
  if (state === 'ready') return Promise.resolve(true)
  if (probing) return probing
  const now = Date.now()
  if (state === 'unavailable' && now - lastProbe < RETRY_MS) return Promise.resolve(false)
  lastProbe = now
  probing = httpJson('GET', '/waveforms')
    .then((data) => {
      waveforms = parseWaveforms(data)
      state = 'ready'
      return true
    })
    .catch(() => {
      state = 'unavailable'
      return false
    })
    .finally(() => {
      probing = null
    })
  return probing
}

/** /waveforms 回傳格式容錯:字串陣列、物件陣列(name/id)、或 {waveforms:[...]} */
function parseWaveforms(data: unknown): string[] {
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { waveforms?: unknown[] }).waveforms)
      ? (data as { waveforms: unknown[] }).waveforms
      : []
  return arr
    .map((w) =>
      typeof w === 'string'
        ? w
        : w && typeof w === 'object'
          ? String((w as { name?: unknown; id?: unknown }).name ?? (w as { id?: unknown }).id ?? '')
          : ''
    )
    .filter(Boolean)
}

/** 棘輪跨齒 tick(fire-and-forget,節流) */
export function hapticTick(): void {
  const s = getSettings()
  if (!s.haptics) return
  if (state !== 'ready') {
    void probe()
    return
  }
  const now = Date.now()
  if (now - lastSend < MIN_INTERVAL_MS) return
  lastSend = now
  send(s.hapticWaveform)
}

function send(idx: number): void {
  const name = waveforms[Math.min(waveforms.length - 1, Math.max(0, idx))]
  if (!name) return
  httpJson('POST', `/haptic/${encodeURIComponent(name)}`).catch(() => {
    // 送失敗 → 視為服務掉線,下次 tick 重新探測
    state = 'unavailable'
  })
}

/** 設定頁「測試震動」:主動探測(不受 30 秒冷卻限制)後送一發,回傳是否成功 */
export async function hapticTest(): Promise<boolean> {
  lastProbe = 0
  if (state === 'unavailable') state = 'idle'
  const ok = await probe()
  if (!ok) return false
  send(getSettings().hapticWaveform)
  return true
}

export function hapticWaveformNames(): string[] {
  return waveforms
}
