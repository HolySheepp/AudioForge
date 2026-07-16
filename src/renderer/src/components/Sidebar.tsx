import { useApp } from '../store'
import { useT } from '../hooks/useT'
import type { ToolId } from '../../../shared/types'

const TOOLS: { id: ToolId; icon: string }[] = [
  { id: 'analysis', icon: '📈' },
  { id: 'normalize', icon: '🎚' },
  { id: 'replace', icon: '🔁' },
  { id: 'extract', icon: '📤' },
  { id: 'convert', icon: '🔄' },
  { id: 'multitrack', icon: '🎛' }
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
