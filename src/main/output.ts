import { existsSync } from 'fs'
import { dirname, join, parse } from 'path'
import type { Settings } from '../shared/types'

/**
 * 輸出路徑規則:預設與來源同資料夾;檔名 = 原名 + 後綴;
 * 衝突時自動加 " (1)"、" (2)";絕不回傳與來源相同的路徑。
 */
export function resolveOutputPath(
  srcPath: string,
  suffix: string,
  ext: string,
  settings: Pick<Settings, 'outputMode' | 'outputDir'>
): string {
  const dir =
    settings.outputMode === 'fixed' && settings.outputDir ? settings.outputDir : dirname(srcPath)
  const base = parse(srcPath).name

  let candidate = join(dir, `${base}${suffix}.${ext}`)
  let n = 1
  while (existsSync(candidate) || candidate.toLowerCase() === srcPath.toLowerCase()) {
    candidate = join(dir, `${base}${suffix} (${n}).${ext}`)
    n++
  }
  return candidate
}
