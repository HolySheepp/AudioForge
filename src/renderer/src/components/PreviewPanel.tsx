import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../store'
import { useT } from '../hooks/useT'
import { toMediaUrl } from '../utils/media'

interface PreviewState {
  url: string
  kind: 'video' | 'audio'
}

/** 抓取播放頭線的像素容差:游標落在線左右此範圍內 → 拖線微調,否則拖時間軸平移 */
const GRAB_PX = 24
const FLICK_THRESHOLD = 700
const PAN_FRICTION = 3
const WINDOW_OPTIONS = [15, 30, 60, 120, 300]

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function fmtClock(sec: number): string {
  if (!Number.isFinite(sec)) return '0:00'
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function PreviewPanel(): React.JSX.Element {
  const t = useT()
  const selectedPath = useApp((s) => s.selectedPath)
  const tool = useApp((s) => s.tool)
  const source = useApp((s) => s.source)
  const processed = useApp((s) => s.processed)
  const replaceAudio = useApp((s) => s.replaceAudio)
  const windowSec = useApp((s) => s.settings?.previewWindowSec ?? 60)
  const saveSettings = useApp((s) => s.saveSettings)

  const item = source.find((it) => it.path === selectedPath) ?? null
  const info = item?.info ?? processed.find((p) => p.path === selectedPath)?.info ?? null

  const [collapsed, setCollapsed] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [loading, setLoading] = useState(false)
  const [genFrac, setGenFrac] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [ab, setAb] = useState<'original' | 'new'>('original')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const bAudioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  // 時間軸可視窗左緣(秒);拖曳/慣性都改這個 ref,不觸發 React 重繪
  const viewStart = useRef(0)
  const drag = useRef<{
    mode: 'line' | 'pan'
    startX: number
    startView: number
    lineFrac: number
    samples: { t: number; x: number }[]
  } | null>(null)
  const inertia = useRef({ raf: 0, vel: 0, last: 0, lineFrac: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  const windowSecRef = useRef(windowSec)
  windowSecRef.current = windowSec

  // ===== 選擇檔案 → 載入預覽與波形(收合時完全不載入,避免無謂解碼/proxy) =====
  useEffect(() => {
    setPreview(null)
    setPeaks(null)
    setError(false)
    setGenFrac(null)
    setAb('original')
    viewStart.current = 0
    if (collapsed || !selectedPath) return
    let alive = true
    setLoading(true)
    window.api
      .ensurePreview(selectedPath)
      .then((r) => alive && setPreview({ url: r.url, kind: r.kind }))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false))
    if (info) {
      window.api
        .getWaveform(selectedPath, info.mtimeMs)
        .then((p) => alive && setPeaks(p))
        .catch(() => undefined)
    }
    return () => {
      alive = false
    }
  }, [selectedPath, info?.mtimeMs, collapsed])

  useEffect(() => {
    return window.api.onPreviewProgress(({ path, frac }) => {
      if (path === selectedPath) setGenFrac(frac)
    })
  }, [selectedPath])

  const stopInertia = (): void => {
    if (inertia.current.raf) cancelAnimationFrame(inertia.current.raf)
    inertia.current.raf = 0
  }

  // ===== 繪製:視窗化波形切片 + 播放頭線 + 邊緣時間 =====
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const media = videoRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    const g = canvas.getContext('2d')
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    const css = getComputedStyle(document.documentElement)
    const accent = css.getPropertyValue('--accent').trim() || '#4f8cff'
    const textCol = css.getPropertyValue('--text').trim() || '#fff'
    const dimCol = css.getPropertyValue('--text-dim').trim() || '#999'
    const mid = h / 2

    const dur = media?.duration && Number.isFinite(media.duration) ? media.duration : 0
    const winLen = dur > 0 ? Math.min(windowSecRef.current, dur) : windowSecRef.current
    const maxView = Math.max(0, dur - winLen)
    const ct = media?.currentTime ?? 0

    // 只在「播放中」才自動跟隨翻頁。暫停/拖曳時絕不自動捲動,
    // 否則播放頭停在視窗邊緣時,currentTime 的取樣誤差會讓畫面反覆彈跳。
    if (media && !media.paused && !drag.current && !inertia.current.raf && dur > winLen) {
      if (ct < viewStart.current - 0.05 || ct > viewStart.current + winLen + 0.05) {
        viewStart.current = clamp(ct - winLen * 0.1, 0, maxView)
      }
    }
    viewStart.current = clamp(viewStart.current, 0, maxView)
    const vs = viewStart.current

    // 波形帶上下留白,讓播放頭線能超出波形範圍(更顯眼)
    const padY = 7
    const amp = mid - padY

    if (peaks && dur > 0) {
      const n = peaks.length / 2
      g.strokeStyle = accent
      g.globalAlpha = 0.85
      g.lineWidth = 1
      g.beginPath()
      for (let x = 0; x < w; x++) {
        const tSec = vs + (x / w) * winLen
        const bucket = Math.min(n - 1, Math.max(0, Math.floor((tSec / dur) * n)))
        g.moveTo(x + 0.5, mid - peaks[bucket * 2 + 1] * amp)
        g.lineTo(x + 0.5, mid - peaks[bucket * 2] * amp)
      }
      g.stroke()
      g.globalAlpha = 1
    }

    if (dur > 0) {
      const lineX = ((ct - vs) / winLen) * w
      if (lineX >= -1 && lineX <= w + 1) {
        // 線貫穿整個高度(超出波形帶)
        g.strokeStyle = textCol
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(lineX, 0)
        g.lineTo(lineX, h)
        g.stroke()

        // 兩端的三角形手把:位置夾在畫布內,線在最左/最右時手把仍完整可見、可辨識可拖
        const tri = 7
        const handleX = clamp(lineX, tri + 1, w - tri - 1)
        g.fillStyle = accent
        g.strokeStyle = css.getPropertyValue('--bg').trim() || '#000'
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(handleX - tri, 0)
        g.lineTo(handleX + tri, 0)
        g.lineTo(handleX, tri + 3)
        g.closePath()
        g.fill()
        g.stroke()
        g.beginPath()
        g.moveTo(handleX - tri, h)
        g.lineTo(handleX + tri, h)
        g.lineTo(handleX, h - tri - 3)
        g.closePath()
        g.fill()
        g.stroke()
      }
      // 邊緣時間標記
      g.fillStyle = dimCol
      g.font = '10px system-ui, sans-serif'
      g.fillText(fmtClock(vs), 3, h - 4)
      const rightLabel = fmtClock(vs + winLen)
      g.fillText(rightLabel, w - g.measureText(rightLabel).width - 3, h - 4)
    }
  }, [peaks])

  // rAF 迴圈:僅在展開且有預覽時運轉(收合 = 零運算)
  useEffect(() => {
    if (collapsed || !preview) return
    const loop = (): void => {
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [collapsed, preview, draw])

  // ===== 互動 =====
  const syncB = (ct: number): void => {
    if (ab === 'new' && bAudioRef.current) bAudioRef.current.currentTime = ct
  }
  const setTime = (sec: number): void => {
    const media = videoRef.current
    if (!media || !media.duration) return
    const ct = clamp(sec, 0, media.duration)
    media.currentTime = ct
    syncB(ct)
  }

  const geom = (): { w: number; dur: number; winLen: number; maxView: number } | null => {
    const canvas = canvasRef.current
    const media = videoRef.current
    if (!canvas || !media || !media.duration) return null
    const w = canvas.getBoundingClientRect().width
    const dur = media.duration
    const winLen = Math.min(windowSecRef.current, dur)
    return { w, dur, winLen, maxView: Math.max(0, dur - winLen) }
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return
    stopInertia()
    const gm = geom()
    if (!gm) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const ct = videoRef.current!.currentTime
    const lineX = ((ct - viewStart.current) / gm.winLen) * gm.w

    // 媒體短於視窗 → 無從平移,一律拖線;否則看游標離線遠近決定
    const mode: 'line' | 'pan' =
      gm.dur <= gm.winLen || Math.abs(px - lineX) <= GRAB_PX ? 'line' : 'pan'

    drag.current = {
      mode,
      startX: e.clientX,
      startView: viewStart.current,
      lineFrac: clamp((ct - viewStart.current) / gm.winLen, 0, 1),
      samples: [{ t: performance.now(), x: e.clientX }]
    }
    if (mode === 'line') setTime(viewStart.current + (px / gm.w) * gm.winLen)
  }

  /**
   * 平移:只動可視窗,播放頭的螢幕位置完全固定(時間隨線底下的內容而變)。
   * 拖到頭/尾後繼續拖,視窗與線都不再移動。回傳是否已撞到邊界。
   */
  const panTo = (
    viewTarget: number,
    lineFrac: number,
    gm: NonNullable<ReturnType<typeof geom>>
  ): boolean => {
    const vs = clamp(viewTarget, 0, gm.maxView)
    viewStart.current = vs
    setTime(vs + lineFrac * gm.winLen)
    return vs <= 0 || vs >= gm.maxView
  }

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const d = drag.current
    const gm = geom()
    if (!d || !gm) return
    const now = performance.now()
    d.samples.push({ t: now, x: e.clientX })
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift()

    if (d.mode === 'line') {
      const rect = e.currentTarget.getBoundingClientRect()
      const px = clamp(e.clientX - rect.left, 0, gm.w)
      setTime(viewStart.current + (px / gm.w) * gm.winLen)
    } else {
      // 平移:內容隨手指移動(往右拖 = 回到更早的時間),播放頭維持在原螢幕位置
      const dx = e.clientX - d.startX
      panTo(d.startView - (dx / gm.w) * gm.winLen, d.lineFrac, gm)
    }
  }

  const onUp = (): void => {
    const d = drag.current
    drag.current = null
    if (!d || d.mode !== 'pan') return // 拖線無慣性;僅時間軸平移有

    const cutoff = performance.now() - 120
    const recent = d.samples.filter((p) => p.t >= cutoff)
    if (recent.length < 2) return
    const dt = (recent[recent.length - 1].t - recent[0].t) / 1000
    if (dt <= 0.005) return
    const vx = (recent[recent.length - 1].x - recent[0].x) / dt
    if (Math.abs(vx) < FLICK_THRESHOLD) return

    const gm = geom()
    if (!gm) return
    inertia.current.vel = -(vx / gm.w) * gm.winLen // 時間軸捲動速度(秒/秒)
    inertia.current.lineFrac = d.lineFrac
    inertia.current.last = performance.now()
    const tick = (nowT: number): void => {
      const g2 = geom()
      if (!g2) return stopInertia()
      const dd = Math.min(0.05, (nowT - inertia.current.last) / 1000)
      inertia.current.last = nowT
      const hitEdge = panTo(
        viewStart.current + inertia.current.vel * dd,
        inertia.current.lineFrac,
        g2
      )
      inertia.current.vel *= Math.exp(-PAN_FRICTION * dd)
      if (hitEdge || Math.abs(inertia.current.vel) < 0.5) return stopInertia()
      inertia.current.raf = requestAnimationFrame(tick)
    }
    inertia.current.raf = requestAnimationFrame(tick)
  }

  // ===== A/B(影片靜音 + 新音軌同步) =====
  const canAb = tool === 'replace' && Boolean(replaceAudio) && preview?.kind === 'video'
  const setAbMode = (mode: 'original' | 'new'): void => {
    setAb(mode)
    const v = videoRef.current
    const b = bAudioRef.current
    if (!v) return
    v.muted = mode === 'new'
    if (b) {
      b.currentTime = v.currentTime
      if (mode === 'new' && !v.paused) void b.play()
      else b.pause()
    }
  }
  const onPlay = (): void => {
    if (ab === 'new' && bAudioRef.current && videoRef.current) {
      bAudioRef.current.currentTime = videoRef.current.currentTime
      void bAudioRef.current.play()
    }
  }
  const onPause = (): void => bAudioRef.current?.pause()
  const onSeeked = (): void => {
    if (bAudioRef.current && videoRef.current) {
      bAudioRef.current.currentTime = videoRef.current.currentTime
    }
  }

  // 右鍵選單:點選單外才關閉(點在選單內會讓 click 來不及觸發)
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent): void => {
      if (menuRef.current?.contains(e.target as Node)) return
      setMenu(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  return (
    <section className={`preview${collapsed ? ' collapsed' : ''}`}>
      <div className="preview-head" onClick={() => setCollapsed(!collapsed)}>
        <h2>{t('preview.title')}</h2>
        <div className="preview-head-right">
          {canAb && !collapsed && (
            <div className="ab-toggle" onClick={(e) => e.stopPropagation()}>
              <button className={ab === 'original' ? 'active' : ''} onClick={() => setAbMode('original')}>
                {t('preview.original')}
              </button>
              <button className={ab === 'new' ? 'active' : ''} onClick={() => setAbMode('new')}>
                {t('preview.new')}
              </button>
            </div>
          )}
          <span className="preview-chevron">{collapsed ? '▲' : '▼'}</span>
        </div>
      </div>
      {!collapsed && (
        <div className="preview-body">
          {!selectedPath ? (
            <p className="preview-hint">{t('preview.noFile')}</p>
          ) : error ? (
            <p className="preview-hint">{t('preview.unsupported')}</p>
          ) : loading || !preview ? (
            <div className="preview-hint">
              {t('preview.generating')}
              {genFrac != null && <span> {Math.round(genFrac * 100)}%</span>}
            </div>
          ) : (
            <>
              <video
                key={preview.url}
                ref={videoRef}
                className={preview.kind === 'video' ? 'preview-video' : 'preview-audio-el'}
                src={preview.url}
                controls
                onPlay={onPlay}
                onPause={onPause}
                onSeeked={onSeeked}
              />
              {canAb && replaceAudio && <audio ref={bAudioRef} src={toMediaUrl(replaceAudio)} />}
              <canvas
                className="preview-wave"
                ref={canvasRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY })
                }}
              />
            </>
          )}
        </div>
      )}
      {menu &&
        createPortal(
          <div className="knob-menu" ref={menuRef} style={{ left: menu.x, top: menu.y }}>
            <span>{t('preview.window')}</span>
            {WINDOW_OPTIONS.map((s) => (
              <button
                key={s}
                className={s === windowSec ? 'active' : ''}
                onClick={() => {
                  void saveSettings({ previewWindowSec: s })
                  setMenu(null)
                }}
              >
                {s}s
              </button>
            ))}
          </div>,
          document.body
        )}
    </section>
  )
}
