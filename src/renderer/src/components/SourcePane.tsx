import { useState } from 'react'
import { useApp, type SourceItem } from '../store'
import { useT } from '../hooks/useT'
import { fmtDuration, fmtDb } from '../utils/format'
import { IconDrop, IconStop, IconWarn } from './icons'

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
            <span className="pane-empty-icon">
              <IconDrop />
            </span>
            <p>{t('source.empty')}</p>
          </div>
        ) : (
          source.map((item) => (
            <SourceRow key={item.id} item={item} tool={tool} onShowError={setErrorView} />
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
  tool,
  onShowError
}: {
  item: SourceItem
  tool: string
  onShowError: (text: string) => void
}): React.JSX.Element {
  const t = useT()
  const setChecked = useApp((s) => s.setChecked)
  const removeSource = useApp((s) => s.removeSource)
  const select = useApp((s) => s.select)
  const selectedPath = useApp((s) => s.selectedPath)
  const cancelItem = useApp((s) => s.cancelItem)
  const replaceAudio = useApp((s) => s.replaceAudio)
  const setReplaceAudio = useApp((s) => s.setReplaceAudio)
  const anyVideoChecked = useApp((s) =>
    s.source.some((it) => it.checked && it.info?.hasVideo)
  )

  const busy = item.status === 'waiting' || item.status === 'running'
  const isVideo = Boolean(item.info?.hasVideo)
  const isAudio = Boolean(item.info && !item.info.hasVideo)
  // 多軌檔的逐軌參數只對應一個檔案 → 勾選時會排擠其他檔案(store 的 exclusive)
  const multiTrack = (item.info?.audioStreams.length ?? 0) > 1

  // 各功能的選取規則
  // replace:影片用勾選框;音訊改用單選圓(勾了影片才解鎖)
  // mixdown:只能選音訊,影片列停用
  const replaceMode = tool === 'replace'
  const audioAsRadio = replaceMode && isAudio
  const disabledRow =
    item.probeFailed ||
    (tool === 'mixdown' && isVideo) ||
    (audioAsRadio && !anyVideoChecked)

  return (
    <div
      className={`row${selectedPath === item.path ? ' selected' : ''}${disabledRow ? ' dimmed' : ''}`}
      onClick={() => select(item.path)}
    >
      {audioAsRadio ? (
        <button
          className={`radio${replaceAudio === item.path ? ' on' : ''}`}
          disabled={!anyVideoChecked}
          title={t('param.replace.useAsAudio')}
          onClick={(e) => {
            e.stopPropagation()
            setReplaceAudio(replaceAudio === item.path ? null : item.path)
          }}
        />
      ) : (
        <input
          type="checkbox"
          checked={item.checked}
          disabled={disabledRow}
          title={multiTrack ? t('source.multitrackExclusive') : undefined}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setChecked(item.id, e.target.checked)}
        />
      )}
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
        {item.note === 'downgradedAac' && (
          <span className="row-note">
            <IconWarn /> {t('note.downgradedAac')}
          </span>
        )}
        {item.analysis?.map((a) => (
          <span key={a.track} className="row-analysis">
            {item.analysis!.length > 1 && (
              <em className="row-analysis-track">{t('param.track', { n: a.track + 1 })}</em>
            )}
            <b>{a.integrated.toFixed(1)}</b> LUFS
            {' · '}
            {a.range.toFixed(1)} LU
            {' · '}
            <b className={a.truePeak > -1 ? 'peak-warn' : ''}>{fmtDb(a.truePeak)}</b> dBTP
          </span>
        ))}
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
          <IconStop />
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
