import { useApp, resolveEffectiveTheme } from '../store'
import { useT } from '../hooks/useT'
import type { ToolId } from '../../../shared/types'
import {
  IconAnalysis,
  IconConvert,
  IconExtract,
  IconGear,
  IconMoon,
  IconMultitrack,
  IconNormalize,
  IconReplace,
  IconSun
} from './icons'

const TOOLS: { id: ToolId; icon: React.JSX.Element }[] = [
  { id: 'analysis', icon: <IconAnalysis /> },
  { id: 'normalize', icon: <IconNormalize /> },
  { id: 'replace', icon: <IconReplace /> },
  { id: 'extract', icon: <IconExtract /> },
  { id: 'convert', icon: <IconConvert /> },
  { id: 'multitrack', icon: <IconMultitrack /> }
]

export function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  const t = useT()
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)
  const settings = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)

  const effective = settings ? resolveEffectiveTheme(settings.theme) : 'dark'

  return (
    <nav className="sidebar">
      {TOOLS.map(({ id, icon }) => (
        <button
          key={id}
          className={`sidebar-item${tool === id ? ' active' : ''}`}
          onClick={() => setTool(id)}
          title={t(`tool.${id}.desc`)}
        >
          <span className="sidebar-icon">{icon}</span>
          <span className="sidebar-text">{t(`tool.${id}`)}</span>
        </button>
      ))}

      {/* 原標題列右上的快捷鈕移居此處(標題列讓位給視窗控制) */}
      <div className="sidebar-footer">
        <button
          className="icon-btn"
          onClick={() =>
            settings && void saveSettings({ language: settings.language === 'zh' ? 'en' : 'zh' })
          }
          title={t('settings.language')}
        >
          {settings?.language === 'zh' ? '繁' : 'EN'}
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
    </nav>
  )
}
