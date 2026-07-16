import { zh, type I18nKey } from './zh'
import { en } from './en'

export type Language = 'zh' | 'en'
export type { I18nKey }

const dicts: Record<Language, Record<I18nKey, string>> = { zh, en }

/** t('source.checkedCount', { n: 3 }) → "已勾選 3 個檔案" */
export function translate(
  lang: Language,
  key: I18nKey,
  vars?: Record<string, string | number>
): string {
  let s: string = dicts[lang][key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}
