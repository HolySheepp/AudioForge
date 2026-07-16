import { useApp } from '../store'
import { useT } from '../hooks/useT'

export function Header({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  if (!settings) return <header className="header" />

  const themes = ['light', 'dark', 'system'] as const
  const themeIcons = { light: '☀', dark: '☾', system: '◐' }
  const nextTheme = themes[(themes.indexOf(settings.theme) + 1) % themes.length]

  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-logo">⚒</span>
        <h1>{t('app.name')}</h1>
      </div>
      <div className="header-actions">
        <button
          className="icon-btn"
          onClick={() => void saveSettings({ language: settings.language === 'zh' ? 'en' : 'zh' })}
          title={t('settings.language')}
        >
          {settings.language === 'zh' ? '繁' : 'EN'}
        </button>
        <button
          className="icon-btn"
          onClick={() => void saveSettings({ theme: nextTheme })}
          title={t(`settings.theme.${settings.theme}`)}
        >
          {themeIcons[settings.theme]}
        </button>
        <button className="icon-btn" onClick={onOpenSettings} title={t('settings.title')}>
          ⚙
        </button>
      </div>
    </header>
  )
}
