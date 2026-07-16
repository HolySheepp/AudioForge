import { useApp } from '../store'
import { translate, type I18nKey } from '../i18n'

/** i18n hook:t('key', {vars}) 依當前語言取字串 */
export function useT(): (key: I18nKey, vars?: Record<string, string | number>) => string {
  const lang = useApp((s) => s.settings?.language ?? 'zh')
  return (key, vars) => translate(lang, key, vars)
}
