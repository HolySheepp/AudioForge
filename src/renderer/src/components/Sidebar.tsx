import { useApp } from '../store'
import { useT } from '../hooks/useT'
import type { ToolId } from '../../../shared/types'
import {
  IconAnalysis,
  IconConvert,
  IconExtract,
  IconMixdown,
  IconNormalize,
  IconReplace
} from './icons'

const TOOLS: { id: ToolId; icon: React.JSX.Element }[] = [
  { id: 'analysis', icon: <IconAnalysis /> },
  { id: 'normalize', icon: <IconNormalize /> },
  { id: 'replace', icon: <IconReplace /> },
  { id: 'extract', icon: <IconExtract /> },
  { id: 'convert', icon: <IconConvert /> },
  { id: 'mixdown', icon: <IconMixdown /> }
]

export function Sidebar(): React.JSX.Element {
  const t = useT()
  const tool = useApp((s) => s.tool)
  const setTool = useApp((s) => s.setTool)

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
    </nav>
  )
}
