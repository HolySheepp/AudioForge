import { useApp, resolveEffectiveTheme } from '../store'
import { useT } from '../hooks/useT'
import { IconGear, IconLogo, IconMoon, IconSun } from './icons'

export function Header({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  if (!settings) return <header className="header" />

  // 快速切換鈕只在淺/深兩態之間切;「跟隨系統」仍可在設定頁選擇
  const effective = resolveEffectiveTheme(settings.theme)
  const toggleTheme = (): void => void saveSettings({ theme: effective === 'dark' ? 'light' : 'dark' })

  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-logo">
          <IconLogo />
        </span>
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
        <button className="icon-btn" onClick={toggleTheme} title={t(`settings.theme.${effective}`)}>
          {effective === 'dark' ? <IconMoon /> : <IconSun />}
        </button>
        <button className="icon-btn" onClick={onOpenSettings} title={t('settings.title')}>
          <IconGear />
        </button>
      </div>
    </header>
  )
}
