import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../hooks/useT'
import { hexToHsv, hsvToHex, type Hsv } from '../utils/color'

interface ColorPickerProps {
  /** 初始顏色(hex) */
  initial: string
  /** 拖曳/調整時即時回報,供主界面預覽 */
  onPreview: (hex: string) => void
  onSave: (hex: string) => void
  onCancel: () => void
}

const SV_W = 220
const SV_H = 150
const HUE_H = 14

/**
 * app 內自製調色盤:SV 色板 + 色相條 + hex,下方 Save/Cancel,面板可拖曳。
 * 不用原生 <input type=color>——那是作業系統視窗,無法改樣式、移位或加按鈕。
 */
export function ColorPicker({ initial, onPreview, onSave, onCancel }: ColorPickerProps): React.JSX.Element {
  const t = useT()
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(initial) ?? { h: 217, s: 0.7, v: 1 })
  const [hexText, setHexText] = useState(initial)
  // 起始位置先給粗略中心,掛載後用實際尺寸精算置中(高度不固定)
  const [pos, setPos] = useState(() => ({
    x: Math.max(8, (window.innerWidth - 252) / 2),
    y: Math.max(8, (window.innerHeight - 320) / 2)
  }))
  const dragOff = useRef<{ x: number; y: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  // 掛載時依實際寬高置中一次(之後拖曳不再干預)
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.max(8, (window.innerWidth - r.width) / 2),
      y: Math.max(8, (window.innerHeight - r.height) / 2)
    })
  }, [])

  const hex = hsvToHex(hsv)
  // onPreview 每次 render 都是新函式;放進 deps 會無限迴圈,用 ref 穩定。
  // 跳過掛載時那一次——開盤瞬間不該改動當前顏色,要等使用者實際拖動才預覽
  const previewRef = useRef(onPreview)
  previewRef.current = onPreview
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    previewRef.current(hex)
  }, [hex])
  useEffect(() => setHexText(hex), [hex])

  // ---- 面板拖曳 ----
  const onHeaderDown = (e: React.PointerEvent): void => {
    dragOff.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onHeaderMove = (e: React.PointerEvent): void => {
    const o = dragOff.current
    if (!o) return
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - 60, e.clientX - o.x)),
      y: Math.max(8, Math.min(window.innerHeight - 60, e.clientY - o.y))
    })
  }
  const onHeaderUp = (): void => {
    dragOff.current = null
  }

  // ---- SV 色板拖曳 ----
  const pickSv = (e: React.PointerEvent): void => {
    const r = svRef.current!.getBoundingClientRect()
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    setHsv((h) => ({ ...h, s, v }))
  }
  const pickHue = (e: React.PointerEvent): void => {
    const r = hueRef.current!.getBoundingClientRect()
    const h = Math.min(360, Math.max(0, ((e.clientX - r.left) / r.width) * 360))
    setHsv((prev) => ({ ...prev, h }))
  }
  const dragHandler =
    (fn: (e: React.PointerEvent) => void) =>
    (e: React.PointerEvent): void => {
      ;(e.target as Element).setPointerCapture(e.pointerId)
      fn(e)
      const move = (ev: PointerEvent): void => fn(ev as unknown as React.PointerEvent)
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

  const commitHex = (): void => {
    const parsed = hexToHsv(hexText)
    if (parsed) setHsv(parsed)
    else setHexText(hex)
  }

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 })

  return createPortal(
    // 邊框用當前正在挑的顏色(開盤時即當前副色),加粗讓浮動面板更明顯
    <div
      ref={rootRef}
      className="colorpicker"
      style={{ left: pos.x, top: pos.y, borderColor: hex, borderWidth: 3 }}
    >
      <div
        className="cp-header"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
      >
        <span>{t('settings.accent.custom')}</span>
        <span className="cp-preview" style={{ background: hex }} />
      </div>

      <div
        ref={svRef}
        className="cp-sv"
        style={{ width: SV_W, height: SV_H, background: hueColor }}
        onPointerDown={dragHandler(pickSv)}
      >
        <div className="cp-sv-white" />
        <div className="cp-sv-black" />
        <div
          className="cp-sv-dot"
          style={{ left: hsv.s * SV_W, top: (1 - hsv.v) * SV_H, background: hex }}
        />
      </div>

      <div
        ref={hueRef}
        className="cp-hue"
        style={{ height: HUE_H }}
        onPointerDown={dragHandler(pickHue)}
      >
        <div className="cp-hue-dot" style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>

      <div className="cp-row">
        <input
          className="cp-hex"
          value={hexText}
          onChange={(e) => setHexText(e.target.value)}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitHex()
          }}
          spellCheck={false}
        />
        <div className="cp-actions">
          <button className="mini-btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button className="mini-btn accent" onClick={() => onSave(hex)}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
