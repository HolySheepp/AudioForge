import { useEffect, useRef, useState } from 'react'

/**
 * 裝飾用自由旋鈕:無數值、無上下限,360° 順逆時鐘無限轉。
 * 齒距 15°(與 True Peak 旋鈕的刻度密度同級),跨齒觸發觸覺 tick,
 * 放在觸覺設定旁讓用戶直接試轉感受波形。
 */
const DEG_PER_DETENT = 15
const PX_PER_DETENT = 14
const FLICK_THRESHOLD = 900
const FRICTION = 3

interface DragState {
  startY: number
  startAngle: number
  samples: { t: number; y: number }[]
}

export function FreeKnob({ label }: { label: string }): React.JSX.Element {
  const [angle, setAngle] = useState(0)
  const [tension, setTension] = useState(0)
  const [freeSpin, setFreeSpin] = useState(false)

  const drag = useRef<DragState | null>(null)
  const raf = useRef(0)
  const vel = useRef(0) // deg/s
  const lastFrame = useRef(0)
  const angleRef = useRef(0)
  angleRef.current = angle

  const snap = (a: number): number => Math.round(a / DEG_PER_DETENT) * DEG_PER_DETENT

  const stopInertia = (): void => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0
    setFreeSpin(false)
  }

  const startInertia = (degPerSec: number): void => {
    vel.current = degPerSec
    lastFrame.current = performance.now()
    setFreeSpin(true)
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - lastFrame.current) / 1000)
      lastFrame.current = now
      setAngle(angleRef.current + vel.current * dt)
      vel.current *= Math.exp(-FRICTION * dt)
      if (Math.abs(vel.current) < DEG_PER_DETENT * 0.8) {
        setAngle(snap(angleRef.current))
        window.api.hapticTick()
        stopInertia()
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => stopInertia(), [])

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    stopInertia()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = {
      startY: e.clientY,
      startAngle: snap(angleRef.current),
      samples: [{ t: performance.now(), y: e.clientY }]
    }
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const now = performance.now()
    d.samples.push({ t: now, y: e.clientY })
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift()

    const rawDetents = (d.startY - e.clientY) / PX_PER_DETENT
    const whole = Math.round(rawDetents)
    setTension(rawDetents - whole)
    const next = d.startAngle + whole * DEG_PER_DETENT
    if (next !== angleRef.current) window.api.hapticTick()
    setAngle(next)
  }

  const onPointerUp = (): void => {
    const d = drag.current
    if (!d) return
    drag.current = null
    setTension(0)
    const cutoff = performance.now() - 120
    const recent = d.samples.filter((s) => s.t >= cutoff)
    if (recent.length >= 2) {
      const first = recent[0]
      const last = recent[recent.length - 1]
      const dt = (last.t - first.t) / 1000
      if (dt > 0.005) {
        const vy = (first.y - last.y) / dt
        if (Math.abs(vy) > FLICK_THRESHOLD) {
          startInertia((vy / PX_PER_DETENT) * DEG_PER_DETENT)
        }
      }
    }
  }

  const onWheel = (e: React.WheelEvent): void => {
    stopInertia()
    setAngle(snap(angleRef.current + (e.deltaY < 0 ? DEG_PER_DETENT : -DEG_PER_DETENT)))
    window.api.hapticTick()
  }

  return (
    <div className="knob">
      <span className="knob-label">{label}</span>
      <div
        className={`knob-dial${freeSpin ? ' free' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <svg viewBox="0 0 72 72" width="72" height="72">
          <circle cx="36" cy="36" r="30" className="knob-face" />
          {/* 刻度環:24 齒佈滿 360° */}
          {Array.from({ length: 24 }).map((_, i) => {
            const a = ((i * DEG_PER_DETENT) * Math.PI) / 180
            const x1 = 36 + Math.sin(a) * 33
            const y1 = 36 - Math.cos(a) * 33
            const x2 = 36 + Math.sin(a) * 35.5
            const y2 = 36 - Math.cos(a) * 35.5
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="knob-tick" />
          })}
          <g transform={`rotate(${angle + tension * 4} 36 36)`}>
            <line x1="36" y1="36" x2="36" y2="10" className="knob-needle" />
          </g>
          <circle cx="36" cy="36" r="4" className="knob-hub" />
        </svg>
      </div>
    </div>
  )
}
