import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { useT } from '../hooks/useT'

interface KnobProps {
  /** 唯一 id:棘輪步進的記憶 key */
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  /** 可選步進(右鍵選單);第一個為預設 */
  stepOptions: number[]
  unit?: string
  /** 顯示小數位 */
  digits?: number
}

const PX_PER_DETENT = 10
/** 甩動進入無阻力模式的釋放速度門檻(px/s) */
const FLICK_THRESHOLD = 900
/** 慣性摩擦:速度每秒衰減至 e^-3 ≈ 5% */
const FRICTION = 3
const ANGLE_RANGE = 270 // -135° ~ +135°

interface DragState {
  startY: number
  startValue: number
  samples: { t: number; y: number }[]
  /** 拖曳中累積的未吸附偏移(做齒間張力視覺) */
  tension: number
}

export function Knob({
  id,
  label,
  value,
  onChange,
  min,
  max,
  stepOptions,
  unit,
  digits = 1
}: KnobProps): React.JSX.Element {
  const t = useT()
  const knobSteps = useApp((s) => s.settings?.knobSteps ?? {})
  const saveSettings = useApp((s) => s.saveSettings)
  const step = knobSteps[id] ?? stepOptions[0]

  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [tension, setTension] = useState(0)
  const [freeSpin, setFreeSpin] = useState(false)

  const drag = useRef<DragState | null>(null)
  const raf = useRef<number>(0)
  const inertiaVel = useRef(0) // value units / second
  const lastFrame = useRef(0)
  const valueRef = useRef(value)
  valueRef.current = value
  const rootRef = useRef<HTMLDivElement>(null)

  const clamp = (v: number): number => Math.min(max, Math.max(min, v))
  const snap = (v: number): number => clamp(Math.round(v / step) * step)

  const stopInertia = (): void => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0
    setFreeSpin(false)
  }

  // 慣性(無阻力)模式:rAF 迴圈,摩擦衰減,撞邊界或速度耗盡即停,停下時吸附到齒
  const startInertia = (velValuePerSec: number): void => {
    inertiaVel.current = velValuePerSec
    lastFrame.current = performance.now()
    setFreeSpin(true)
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - lastFrame.current) / 1000)
      lastFrame.current = now
      let v = valueRef.current + inertiaVel.current * dt
      inertiaVel.current *= Math.exp(-FRICTION * dt)
      const hitEdge = v <= min || v >= max
      v = clamp(v)
      onChange(v)
      if (hitEdge || Math.abs(inertiaVel.current) < step * 0.8) {
        onChange(snap(v))
        // 慣性結束、重新咬合棘輪 → 補一發觸覺 tick
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
    if (e.button !== 0 || editing) return
    stopInertia()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = {
      startY: e.clientY,
      startValue: valueRef.current,
      samples: [{ t: performance.now(), y: e.clientY }],
      tension: 0
    }
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const now = performance.now()
    d.samples.push({ t: now, y: e.clientY })
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift()

    const dy = d.startY - e.clientY
    const rawDetents = dy / PX_PER_DETENT
    const whole = Math.round(rawDetents)
    setTension(rawDetents - whole) // 齒間張力,做微小的視覺旋轉
    const next = clamp(d.startValue + whole * step)
    if (next !== valueRef.current) window.api.hapticTick() // 跨齒 → 觸覺回饋
    onChange(next)
  }

  const onPointerUp = (): void => {
    const d = drag.current
    if (!d) return
    drag.current = null
    setTension(0)
    // 釋放速度(px/s)→ 超過門檻進入無阻力慣性;只取最後 120ms 的樣本,避免慢拖稀釋末段甩速
    const cutoff = performance.now() - 120
    const recent = d.samples.filter((s) => s.t >= cutoff)
    if (recent.length >= 2) {
      const first = recent[0]
      const last = recent[recent.length - 1]
      const dt = (last.t - first.t) / 1000
      if (dt > 0.005) {
        const vy = (first.y - last.y) / dt
        if (Math.abs(vy) > FLICK_THRESHOLD) {
          startInertia((vy / PX_PER_DETENT) * step)
        }
      }
    }
  }

  const onWheel = (e: React.WheelEvent): void => {
    stopInertia()
    const next = snap(valueRef.current + (e.deltaY < 0 ? step : -step))
    if (next !== valueRef.current) window.api.hapticTick()
    onChange(next)
  }

  const beginEdit = (): void => {
    stopInertia()
    setEditText(String(valueRef.current))
    setEditing(true)
  }

  const commitEdit = (): void => {
    const v = Number(editText)
    if (Number.isFinite(v)) onChange(clamp(v))
    setEditing(false)
  }

  // 右鍵選單:點外面關閉
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menuOpen])

  const frac = (value - min) / (max - min)
  const angle = -ANGLE_RANGE / 2 + frac * ANGLE_RANGE + tension * 4

  return (
    <div className="knob" ref={rootRef}>
      <span className="knob-label">{label}</span>
      <div
        className={`knob-dial${freeSpin ? ' free' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={beginEdit}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuOpen(true)
        }}
        title={t('knob.doubleClickHint')}
      >
        <svg viewBox="0 0 72 72" width="72" height="72">
          <circle cx="36" cy="36" r="30" className="knob-face" />
          {/* 刻度環 */}
          {Array.from({ length: 11 }).map((_, i) => {
            const a = ((-ANGLE_RANGE / 2 + (i / 10) * ANGLE_RANGE) * Math.PI) / 180
            const x1 = 36 + Math.sin(a) * 33
            const y1 = 36 - Math.cos(a) * 33
            const x2 = 36 + Math.sin(a) * 35.5
            const y2 = 36 - Math.cos(a) * 35.5
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="knob-tick" />
          })}
          {/* 指針 */}
          <g transform={`rotate(${angle} 36 36)`}>
            <line x1="36" y1="36" x2="36" y2="10" className="knob-needle" />
          </g>
          <circle cx="36" cy="36" r="4" className="knob-hub" />
        </svg>
      </div>
      {editing ? (
        <input
          className="knob-input"
          autoFocus
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span className="knob-value" onDoubleClick={beginEdit}>
          {value.toFixed(digits)}
          {unit ? <em>{unit}</em> : null}
        </span>
      )}
      {menuOpen && (
        <div className="knob-menu">
          <span>{t('knob.step')}</span>
          {stepOptions.map((s) => (
            <button
              key={s}
              className={s === step ? 'active' : ''}
              onClick={() => {
                void saveSettings({ knobSteps: { [id]: s } })
                setMenuOpen(false)
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
