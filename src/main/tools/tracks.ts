/**
 * 逐軌參數的解讀。
 *
 * renderer 送來的軌道設定是以「軌序」記憶的,長度不必等於當前檔案的軌數——
 * 批次裡每個檔案軌數可能不同,所以一律在 runner 這端依實際 probe 結果收斂。
 */

/** 勾選式的軌道參數 → 實際存在的軌序;沒給或全部越界時退回第一軌 */
export function resolveTracks(raw: unknown, count: number): number[] {
  if (count <= 0) return []
  const wanted = Array.isArray(raw) ? raw.map(Number).filter(Number.isInteger) : null
  if (!wanted || wanted.length === 0) return [0]
  const kept = wanted.filter((i) => i >= 0 && i < count).sort((a, b) => a - b)
  return kept.length ? kept : [0]
}

/** 逐軌設定陣列 → 補滿/裁切到實際軌數 */
export function resolveTrackCfgs<T>(raw: unknown, count: number, fill: T): T[] {
  const saved = Array.isArray(raw) ? (raw as T[]) : []
  return Array.from({ length: count }, (_, i) => saved[i] ?? fill)
}
