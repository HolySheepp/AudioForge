import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { useT } from '../hooks/useT'

function toMediaUrl(path: string): string {
  return 'media:///' + path.split(/[\\/]/).map(encodeURIComponent).join('/')
}

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

  const seek = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const media = videoRef.current
    if (!media || !media.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    media.currentTime = frac * media.duration
    if (ab === 'new' && bAudioRef.current) bAudioRef.current.currentTime = media.currentTime
  }

  // A/B:B 模式 = 影片靜音 + 新音軌同步播放
  const canAb = tool === 'replace' && Boolean(item?.replaceAudioPath) && preview?.kind === 'video'
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
              {canAb && item?.replaceAudioPath && (
                <audio ref={bAudioRef} src={toMediaUrl(item.replaceAudioPath)} />
              )}
              <canvas className="preview-wave" ref={canvasRef} onClick={seek} />
            </>
          )}
        </div>
      )}
    </section>
  )
}
