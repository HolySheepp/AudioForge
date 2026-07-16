import { useApp } from '../store'
import { useT } from '../hooks/useT'
import { fmtDuration, fmtSize } from '../utils/format'

export function ProcessedPane(): React.JSX.Element {
  const t = useT()
  const processed = useApp((s) => s.processed)
  const moveToSource = useApp((s) => s.moveToSource)
  const moveAllToSource = useApp((s) => s.moveAllToSource)
  const clearProcessed = useApp((s) => s.clearProcessed)
  const select = useApp((s) => s.select)
  const selectedPath = useApp((s) => s.selectedPath)

  return (
    <section className="pane pane-processed">
      <div className="pane-header">
        <h2>{t('processed.title')}</h2>
        <div className="pane-tools">
          <button className="mini-btn" onClick={moveAllToSource} disabled={!processed.length}>
            ⬅ {t('processed.moveAllToSource')}
          </button>
          <button className="mini-btn danger" onClick={clearProcessed} disabled={!processed.length}>
            {t('processed.clear')}
          </button>
        </div>
      </div>
      <div className="pane-body">
        {processed.length === 0 ? (
          <div className="pane-empty">
            <span className="pane-empty-icon">✓</span>
            <p>{t('processed.empty')}</p>
          </div>
        ) : (
          processed.map((item) => (
            <div
              key={item.id}
              className={`row${selectedPath === item.path ? ' selected' : ''}`}
              onClick={() => select(item.path)}
            >
              <div className="row-main">
                <span className="row-name" title={item.path}>
                  {item.path.split(/[\\/]/).pop()}
                </span>
                <span className="row-meta">
                  {item.info
                    ? `${fmtDuration(item.info.durationSec)} · ${fmtSize(item.info.sizeBytes)}`
                    : ''}
                </span>
              </div>
              <button
                className="mini-btn accent"
                title={t('processed.moveToSource')}
                onClick={(e) => {
                  e.stopPropagation()
                  moveToSource(item.id)
                }}
              >
                ⬅
              </button>
              <button
                className="mini-btn"
                title={t('processed.openFolder')}
                onClick={(e) => {
                  e.stopPropagation()
                  void window.api.showInFolder(item.path)
                }}
              >
                📂
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
