import { useApp } from '../store'
import { useT } from '../hooks/useT'
import type { ToolId } from '../../../shared/types'
import {
  IconAnalysis,
  IconConvert,
  IconExtract,
  IconMultitrack,
  IconNormalize,
  IconReplace
} from './icons'

const TOOLS: { id: ToolId; icon: React.JSX.Element }[] = [
  { id: 'analysis', icon: <IconAnalysis /> },
  { id: 'normalize', icon: <IconNormalize /> },
  { id: 'replace', icon: <IconReplace /> },
  { id: 'extract', icon: <IconExtract /> },
  { id: 'convert', icon: <IconConvert /> },
  { id: 'multitrack', icon: <IconMultitrack /> }
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
        >
          <span className="sidebar-icon">{icon}</span>
          <span className="sidebar-text">
            <strong>{t(`tool.${id}`)}</strong>
            <small>{t(`tool.${id}.desc`)}</small>
          </span>
        </button>
      ))}
    </nav>
  )
}
