import { useEffect, useState } from 'react'
import { useApp } from './store'
import { Header } from './components/Header'
import { OptionsBar } from './components/OptionsBar'
import { Sidebar } from './components/Sidebar'
import { SourcePane } from './components/SourcePane'
import { ProcessedPane } from './components/ProcessedPane'
import { ParamsPanel } from './components/ParamsPanel'
import { PreviewPanel } from './components/PreviewPanel'
import { StatusBar } from './components/StatusBar'
import { SettingsModal } from './components/SettingsModal'
import { Toasts } from './components/Toasts'
import './styles/app.css'

export default function App(): React.JSX.Element {
  const init = useApp((s) => s.init)
  const addPaths = useApp((s) => s.addPaths)
  const settings = useApp((s) => s.settings)
  const [dragging, setDragging] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    let depth = 0
    const onDragEnter = (e: DragEvent): void => {
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const onDragOver = (e: DragEvent): void => e.preventDefault()
    const onDragLeave = (): void => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      const paths = files.map((f) => window.api.getPathForFile(f)).filter(Boolean)
      if (paths.length) void addPaths(paths)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addPaths])

  if (!settings) return <div className="app-loading" />

  return (
    <div className={`app${dragging ? ' dragging' : ''}`}>
      <Header />
      <OptionsBar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="app-mid">
        <Sidebar />
        <div className="app-center">
          <div className="panes">
            <SourcePane />
            <ProcessedPane />
          </div>
          <ParamsPanel />
          <PreviewPanel />
        </div>
      </div>
      <StatusBar />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <Toasts />
      {dragging && <div className="drop-overlay" />}
    </div>
  )
}
