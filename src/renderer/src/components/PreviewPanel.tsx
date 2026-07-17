import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { useT } from '../hooks/useT'
import { toMediaUrl } from '../utils/media'

interface PreviewState {
  url: string
  kind: 'video' | 'audio'
}

export function PreviewPanel(): React.JSX.Element {
  const t = useT()
  const selectedPath = useApp((s) => s.selectedPath)
  const tool = useApp((s) => s.tool)
  const source = useApp((s) => s.source)
  const processed = useApp((s) => s.processed)

  const item = source.find((it) => it.path === selectedPath) ?? null
  const info = item?.info ?? processed.find((p) => p.path === selectedPath)?.info ?? null

  const [collapsed, setCollapsed] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [loading, setLoading] = useState(false)
  const [genFrac, setGenFrac] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [ab, setAb] = useState<'original' | 'new'>('original')

  const videoRef = useRef<HTMLVideoElement>(null)
  const bAudioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  // 選擇檔案 → 載入預覽與波形
  useEffect(() => {
    setPreview(null)
    setPeaks(null)
    setError(false)
    setGenFrac(null)
    setAb('original')
    if (!selectedPath) return
    let alive = true
    setLoading(true)
    window.api
      .ensurePreview(selectedPath)
      .then((r) => {
        if (alive) setPreview({ url: r.url, kind: r.kind })
      })
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
  }, [selectedPath, info?.mtimeMs])

  // proxy 產生進度
  useEffect(() => {
    return window.api.onPreviewProgress(({ path, frac }) => {
      if (path === selectedPath) setGenFrac(frac)
    })
  }, [selectedPath])

  // 波形繪製(peaks + 播放頭 + true peak 參考線)
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    const g = canvas.getContext('2d')
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    const css = getComputedStyle(document.documentElement)
    const mid = h / 2

    if (peaks) {
      g.strokeStyle = css.getPropertyValue('--accent').trim() || '#4f8cff'
      g.globalAlpha = 0.85
      g.lineWidth = 1
      const n = peaks.length / 2
      g.beginPath()
      for (let i = 0; i < n; i++) {
        const x = (i / n) * w
        const min = peaks[i * 2]
        const max = peaks[i * 2 + 1]
        g.moveTo(x, mid - max * (mid - 2))
        g.lineTo(x, mid - min * (mid - 2))
      }
      g.stroke()
      g.globalAlpha = 1

      // true peak 參考線(有分析結果時)
      const tp = item?.analysis?.truePeak
      if (tp != null) {
        const amp = Math.pow(10, tp / 20)
        const y = mid - amp * (mid - 2)
        g.strokeStyle =
          tp > -1
            ? css.getPropertyValue('--danger').trim() || '#ff5c5c'
            : css.getPropertyValue('--warning').trim() || '#ffb648'
        g.setLineDash([4, 3])
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(w, y)
        g.moveTo(0, h - y)
        g.lineTo(w, h - y)
        g.stroke()
        g.setLineDash([])
      }
    }

    // 播放頭
    const media = videoRef.current
    if (media && media.duration > 0) {
      const x = (media.currentTime / media.duration) * w
      g.strokeStyle = css.getPropertyValue('--text').trim() || '#fff'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, h)
      g.stroke()
    }
  }, [peaks, item?.analysis?.truePeak])

  useEffect(() => {
    draw()
    const loop = (): void => {
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  // ===== 時間軸拖動(scrub)+ 甩動慣性 =====
  const scrub = useRef<{ samples: { t: number; x: number }[] } | null>(null)
  const inertiaRaf = useRef(0)
  const inertiaVel = useRef(0) // px/s
  const inertiaLast = useRef(0)

  const stopTimelineInertia = (): void => {
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current)
    inertiaRaf.current = 0
  }
  useEffect(() => stopTimelineInertia, [selectedPath])

  const seekToX = (clientX: number, el: HTMLCanvasElement): void => {
    const media = videoRef.current
    if (!media || !media.duration) return
    const rect = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    media.currentTime = frac * media.duration
    if (ab === 'new' && bAudioRef.current) bAudioRef.current.currentTime = media.currentTime
  }

  const onWaveDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return
    stopTimelineInertia()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    scrub.current = { samples: [{ t: performance.now(), x: e.clientX }] }
    seekToX(e.clientX, e.currentTarget)
  }

  const onWaveMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const s = scrub.current
    if (!s) return
    const now = performance.now()
    s.samples.push({ t: now, x: e.clientX })
    while (s.samples.length > 2 && now - s.samples[0].t > 100) s.samples.shift()
    seekToX(e.clientX, e.currentTarget)
  }

  const onWaveUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const s = scrub.current
    if (!s) return
    scrub.current = null
    // 快甩鬆手 → 時間軸慣性滑動(摩擦衰減,節流到每影格一次 seek)
    const cutoff = performance.now() - 120
    const recent = s.samples.filter((p) => p.t >= cutoff)
    if (recent.length < 2) return
    const dt = (recent[recent.length - 1].t - recent[0].t) / 1000
    if (dt <= 0.005) return
    const vx = (recent[recent.length - 1].x - recent[0].x) / dt
    if (Math.abs(vx) < 800) return

    const canvas = e.currentTarget
    inertiaVel.current = vx
    inertiaLast.current = performance.now()
    const tick = (now: number): void => {
      const media = videoRef.current
      if (!media || !media.duration) return
      const d = Math.min(0.05, (now - inertiaLast.current) / 1000)
      inertiaLast.current = now
      const pxPerSec = canvas.getBoundingClientRect().width / media.duration
      let next = media.currentTime + (inertiaVel.current / pxPerSec) * d
      inertiaVel.current *= Math.exp(-3 * d)
      const hitEdge = next <= 0 || next >= media.duration
      next = Math.min(media.duration, Math.max(0, next))
      media.currentTime = next
      if (ab === 'new' && bAudioRef.current) bAudioRef.current.currentTime = next
      if (hitEdge || Math.abs(inertiaVel.current) < 40) {
        stopTimelineInertia()
        return
      }
      inertiaRaf.current = requestAnimationFrame(tick)
    }
    inertiaRaf.current = requestAnimationFrame(tick)
  }

  // A/B:B 模式 = 影片靜音 + 新音軌同步播放
  const replaceAudio = useApp((s) => s.replaceAudio)
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

  return (
    <section className={`preview${collapsed ? ' collapsed' : ''}`}>
      <div className="preview-head" onClick={() => setCollapsed(!collapsed)}>
        <h2>{t('preview.title')}</h2>
        <div className="preview-head-right">
          {canAb && !collapsed && (
            <div className="ab-toggle" onClick={(e) => e.stopPropagation()}>
              <button
                className={ab === 'original' ? 'active' : ''}
                onClick={() => setAbMode('original')}
              >
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
              {canAb && replaceAudio && (
                <audio ref={bAudioRef} src={toMediaUrl(replaceAudio)} />
              )}
              <canvas
                className="preview-wave"
                ref={canvasRef}
                onPointerDown={onWaveDown}
                onPointerMove={onWaveMove}
                onPointerUp={onWaveUp}
                onPointerCancel={onWaveUp}
              />
            </>
          )}
        </div>
      )}
    </section>
  )
}
