import { useState } from 'react'
import { useApp, type SourceItem } from '../store'
import { useT } from '../hooks/useT'
import { fmtDuration, fmtDb } from '../utils/format'
import { AUDIO_EXTS } from '../../../shared/types'

export function SourcePane(): React.JSX.Element {
  const t = useT()
  const tool = useApp((s) => s.tool)
  const source = useApp((s) => s.source)
  const checkAll = useApp((s) => s.checkAll)
  const clearSource = useApp((s) => s.clearSource)
  const [errorView, setErrorView] = useState<string | null>(null)

  return (
    <section className="pane pane-source">
      <div className="pane-header">
        <h2>{t('source.title')}</h2>
        <div className="pane-tools">
          <button className="mini-btn" onClick={() => checkAll(true)}>{t('source.selectAll')}</button>
          <button className="mini-btn" onClick={() => checkAll(false)}>{t('source.selectNone')}</button>
          <button className="mini-btn danger" onClick={clearSource}>{t('source.clearAll')}</button>
        </div>
      </div>
      <div className="pane-body">
        {source.length === 0 ? (
          <div className="pane-empty">
            <span className="pane-empty-icon">⤵</span>
            <p>{t('source.empty')}</p>
            <small>{t('source.emptyHint')}</small>
          </div>
        ) : (
          source.map((item) => (
            <SourceRow
              key={item.id}
              item={item}
              showReplace={tool === 'replace'}
              onShowError={setErrorView}
            />
          ))
        )}
      </div>
      {errorView && (
        <div className="modal-backdrop" onClick={() => setErrorView(null)}>
          <div className="modal modal-error" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{t('status.errorTitle')}</h2>
              <button className="row-x" onClick={() => setErrorView(null)}>✕</button>
            </div>
            <pre className="error-log">{errorView}</pre>
          </div>
        </div>
      )}
    </section>
  )
}

function SourceRow({
  item,
  showReplace,
  onShowError
}: {
  item: SourceItem
  showReplace: boolean
  onShowError: (text: string) => void
}): React.JSX.Element {
  const t = useT()
  const setChecked = useApp((s) => s.setChecked)
  const removeSource = useApp((s) => s.removeSource)
  const select = useApp((s) => s.select)
  const selectedPath = useApp((s) => s.selectedPath)
  const cancelItem = useApp((s) => s.cancelItem)
  const setReplaceAudio = useApp((s) => s.setReplaceAudio)

  const busy = item.status === 'waiting' || item.status === 'running'
  // Replace 模式:把音訊檔直接拖到影片列上即完成配對
  const rowDropTarget = showReplace && Boolean(item.info?.hasVideo)

  return (
    <div
      className={`row${selectedPath === item.path ? ' selected' : ''}${item.probeFailed ? ' failed' : ''}`}
      onClick={() => select(item.path)}
      onDragOver={(e) => {
        if (rowDropTarget) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onDrop={(e) => {
        if (!rowDropTarget) return
        const file = e.dataTransfer.files[0]
        if (!file) return
        const path = window.api.getPathForFile(file)
        const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
        if (AUDIO_EXTS.includes(ext)) {
          e.preventDefault()
          e.stopPropagation()
          setReplaceAudio(item.id, path)
        }
      }}
    >
      <input
        type="checkbox"
        checked={item.checked}
        disabled={item.probeFailed}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setChecked(item.id, e.target.checked)}
      />
      <div className="row-main">
        <span className="row-name" title={item.path}>{item.info?.name ?? item.path}</span>
        <span className="row-meta">
          {item.info ? (
            <>
              {fmtDuration(item.info.durationSec)}
              {' · '}
              {item.info.hasVideo ? `${item.info.videoCodec} · ` : ''}
              {item.info.audioStreams.length > 1
                ? t('fmt.tracks', { n: item.info.audioStreams.length })
                : item.info.audioStreams[0]?.codec ?? ''}
            </>
          ) : item.probeFailed ? (
            t('status.failed')
          ) : (
            t('source.probing')
          )}
        </span>
        {showReplace && item.info?.hasVideo && (
          <ReplacePicker
            value={item.replaceAudioPath}
            onPick={(p) => setReplaceAudio(item.id, p)}
          />
        )}
        {item.note === 'downgradedAac' && (
          <span className="row-note">⚠ {t('note.downgradedAac')}</span>
        )}
        {item.analysis && (
          <span className="row-analysis">
            <b>{item.analysis.integrated.toFixed(1)}</b> LUFS
            {' · '}
            {item.analysis.range.toFixed(1)} LU
            {' · '}
            <b className={item.analysis.truePeak > -1 ? 'peak-warn' : ''}>
              {fmtDb(item.analysis.truePeak)}
            </b>{' '}
            dBTP
          </span>
        )}
        {busy && (
          <div className="row-progress">
            <div className="row-progress-fill" style={{ width: `${item.progress * 100}%` }} />
          </div>
        )}
      </div>
      <span className={`row-status st-${item.status}`}>
        {item.status !== 'idle' ? t(`status.${item.status}`) : ''}
      </span>
      {item.status === 'failed' && item.errorTail && (
        <button
          className="mini-btn"
          onClick={(e) => {
            e.stopPropagation()
            onShowError(item.errorTail!.split('\n').slice(-30).join('\n'))
          }}
        >
          {t('status.viewError')}
        </button>
      )}
      {busy ? (
        <button
          className="row-x"
          title={t('common.cancel')}
          onClick={(e) => {
            e.stopPropagation()
            cancelItem(item.id)
          }}
        >
          ⏹
        </button>
      ) : (
        <button
          className="row-x"
          title={t('source.remove')}
          onClick={(e) => {
            e.stopPropagation()
            removeSource(item.id)
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

function ReplacePicker({
  value,
  onPick
}: {
  value: string | null
  onPick: (p: string | null) => void
}): React.JSX.Element {
  const t = useT()
  return (
    <span className="row-replace" onClick={(e) => e.stopPropagation()}>
      {value ? (
        <>
          <span className="row-replace-name" title={value}>
            🎵 {value.split(/[\\/]/).pop()}
          </span>
          <button className="row-x" onClick={() => onPick(null)}>✕</button>
        </>
      ) : (
        <button
          className="mini-btn accent"
          onClick={() => {
            void window.api.pickAudioFile().then((p) => {
              if (p) onPick(p)
            })
          }}
        >
          {t('param.replace.pickAudio')}
        </button>
      )}
    </span>
  )
}
