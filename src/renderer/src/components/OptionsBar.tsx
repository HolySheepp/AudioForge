import { useApp, resolveEffectiveTheme } from '../store'
import { useT } from '../hooks/useT'
import { IconGear, IconMoon, IconSun } from './icons'

/** 標題列下方的選項列:語言 / 主題 / 設定,靠右對齊 */
export function OptionsBar({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  if (!settings) return <div className="options-bar" />

  const effective = resolveEffectiveTheme(settings.theme)

  return (
    <div className="options-bar">
      <button
        className="icon-btn"
        onClick={() => void saveSettings({ language: settings.language === 'zh' ? 'en' : 'zh' })}
        title={t('settings.language')}
      >
        {settings.language === 'zh' ? '繁' : 'EN'}
      </button>
      <button
        className="icon-btn"
        onClick={() => void saveSettings({ theme: effective === 'dark' ? 'light' : 'dark' })}
        title={t(`settings.theme.${effective}`)}
      >
        {effective === 'dark' ? <IconMoon /> : <IconSun />}
      </button>
      <button className="icon-btn" onClick={onOpenSettings} title={t('settings.title')}>
        <IconGear />
      </button>
    </div>
  )
}
