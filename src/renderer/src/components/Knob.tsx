import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/**
 * 齒間張力最多推進到「一齒角度」的幾成。必須 < 0.5,否則指針在吸附前就越過了
 * 下一齒的位置,放開時會往回彈——step 越小這個現象越明顯(0.1 時齒距僅 0.9°)。
 * 因為是比例而非固定度數,任何 step 都不會彈回。
 */
const TENSION_RATIO = 0.34
/** 張力角度上限:齒距很大時(step 1)不要讓指針飄太遠 */
const TENSION_MAX_DEG = 4

/**
 * 跨齒不是瞬移,而是用彈簧把「落後量」拉回 0:自然頻率 rad/s + 阻尼比。
 * 阻尼比 < 1 會有約一成過衝,看起來就是指針彈過棘齒才咬合。
 * 現值約 120ms 內收斂——夠快不拖泥,又足以讓眼睛看見那一下移動。
 */
const SNAP_OMEGA = 52
const SNAP_ZETA = 0.6
/** 落後量上限(齒數):快速連轉時不要累積成大幅拖尾 */
const LAG_CAP_DETENTS = 1.2

interface DragState {
  startY: number
  startValue: number
  samples: { t: number; y: number }[]
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
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [freeSpin, setFreeSpin] = useState(false)

  const drag = useRef<DragState | null>(null)
  const raf = useRef<number>(0)
  const inertiaVel = useRef(0) // value units / second
  const lastFrame = useRef(0)
  const valueRef = useRef(value)
  valueRef.current = value
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 指針角度不走 React state:每幀 setState 會讓整個旋鈕重繪,這裡只需要改一個
  // transform。角度 = 值對應角 + 落後量(彈簧回正) + 齒間張力。
  const needleRef = useRef<SVGGElement>(null)
  const lagRef = useRef(0) // 度,指針目前落後真實角度多少
  const lagVel = useRef(0) // 度/秒
  const tensionRef = useRef(0) // 度
  const settleRaf = useRef(0)
  const lastSettle = useRef(0)
  const shownRef = useRef(0) // 上一幀實際畫出來的角度,跨齒彈簧的起點

  const clamp = (v: number): number => Math.min(max, Math.max(min, v))
  const snap = (v: number): number => clamp(Math.round(v / step) * step)

  /** 一齒在錶面上佔多少角度——張力幅度與落後上限都以它為基準 */
  const detentAngle = (step / (max - min)) * ANGLE_RANGE

  const angleOf = (v: number): number =>
    -ANGLE_RANGE / 2 + ((v - min) / (max - min)) * ANGLE_RANGE

  const paint = (): void => {
    const a = angleOf(valueRef.current) + lagRef.current + tensionRef.current
    shownRef.current = a
    needleRef.current?.setAttribute('transform', `rotate(${a} 36 36)`)
  }
  // value 由外部驅動(props),每次 render 後補畫一次。必須是 layout effect:
  // React 會在 commit 時把 transform 重設回無落後量的角度,若等到 paint 之後才修正,
  // 跨齒那一幀會先閃一下正確終點,彈簧效果就毀了
  useLayoutEffect(paint)

  const stopSettle = (): void => {
    if (settleRaf.current) cancelAnimationFrame(settleRaf.current)
    settleRaf.current = 0
    lagRef.current = 0
    lagVel.current = 0
  }

  /**
   * 跨齒:把指針釘在「跨齒前那一幀實際畫出來的位置」(記為落後量),再用彈簧高速
   * 拉到新齒。以實畫角度為起點是必要的——跨齒瞬間齒間張力會從 +span 翻到 −span,
   * 只補償值的位移會讓指針先倒退一下。
   */
  const springTo = (targetAngle: number): void => {
    const cap = detentAngle * LAG_CAP_DETENTS
    const lag = shownRef.current - targetAngle
    lagRef.current = Math.min(cap, Math.max(-cap, lag))
    if (settleRaf.current) return // 已在回正,新的落後量已寫入 lagRef
    lastSettle.current = performance.now()
    settleRaf.current = requestAnimationFrame(settleTick)
  }

  /** 值變更後立即改寫 valueRef 並重畫;props 要下一次 render 才會到 */
  const commit = (next: number): void => {
    onChange(next)
    valueRef.current = next
    paint()
  }

  const settleTick = (now: number): void => {
    const dt = Math.min(0.04, (now - lastSettle.current) / 1000)
    lastSettle.current = now
    const a = -SNAP_OMEGA * SNAP_OMEGA * lagRef.current - 2 * SNAP_ZETA * SNAP_OMEGA * lagVel.current
    lagVel.current += a * dt
    lagRef.current += lagVel.current * dt
    if (Math.abs(lagRef.current) < 0.03 && Math.abs(lagVel.current) < 1) {
      stopSettle()
      paint()
      return
    }
    paint()
    settleRaf.current = requestAnimationFrame(settleTick)
  }

  const stopInertia = (): void => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0
    setFreeSpin(false)
  }

  // 慣性(無阻力)模式:rAF 迴圈,摩擦衰減,撞邊界或速度耗盡即停,停下時吸附到齒
  const startInertia = (velValuePerSec: number): void => {
    // 無阻力模式本來就是連續移動,不需要(也不該)再疊跨齒的彈簧落後
    stopSettle()
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
      commit(v)
      if (hitEdge || Math.abs(inertiaVel.current) < step * 0.8) {
        const rest = snap(v)
        springTo(angleOf(rest)) // 最後咬合到齒也走彈簧,不要瞬移
        commit(rest)
        // 慣性結束、重新咬合棘輪 → 補一發觸覺 tick
        window.api.hapticTick()
        stopInertia()
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  useEffect(
    () => () => {
      stopInertia()
      stopSettle()
    },
    []
  )

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 || editing) return
    stopInertia()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = {
      startY: e.clientY,
      startValue: valueRef.current,
      samples: [{ t: performance.now(), y: e.clientY }]
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
    // 齒間張力:幅度取「一齒角度」的固定比例(上限 TENSION_MAX_DEG),
    // 所以 step 0.1 / 0.5 / 1 各自有相稱的預備行程,不會有小 step 越界再彈回
    const span = Math.min(detentAngle * TENSION_RATIO, TENSION_MAX_DEG)
    tensionRef.current = (rawDetents - whole) * 2 * span
    const next = clamp(d.startValue + whole * step)
    if (next !== valueRef.current) {
      window.api.hapticTick() // 跨齒 → 觸覺回饋
      springTo(angleOf(next) + tensionRef.current)
    }
    commit(next)
  }

  const onPointerUp = (): void => {
    const d = drag.current
    if (!d) return
    drag.current = null
    // 放手時張力歸零也是一段位移,同樣交給彈簧(springTo 需在 tension 清掉前呼叫)
    springTo(angleOf(valueRef.current))
    tensionRef.current = 0
    paint()
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
    if (next !== valueRef.current) {
      window.api.hapticTick()
      springTo(angleOf(next))
    }
    commit(next)
  }

  const beginEdit = (): void => {
    stopInertia()
    setEditText(valueRef.current.toFixed(digits))
    setEditing(true)
  }

  const commitEdit = (): void => {
    const v = Number(editText)
    if (Number.isFinite(v)) onChange(clamp(v))
    setEditing(false)
  }

  // 右鍵選單:portal 到 body,不受面板捲軸/邊界裁切;點外面或捲動時關閉
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent): void => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    const closeOnScroll = (): void => setMenuOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [menuOpen])

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
          const r = rootRef.current!.getBoundingClientRect()
          setMenuPos({ x: r.left + r.width / 2, y: r.bottom + 4 })
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
          {/* 指針:角度由 paint() 直接寫 transform(每幀 setState 會整顆旋鈕重繪) */}
          <g ref={needleRef} transform={`rotate(${angleOf(value)} 36 36)`}>
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
      {menuOpen &&
        createPortal(
          <div
            className="knob-menu"
            ref={menuRef}
            style={{ left: menuPos.x, top: menuPos.y }}
          >
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
          </div>,
          document.body
        )}
    </div>
  )
}
