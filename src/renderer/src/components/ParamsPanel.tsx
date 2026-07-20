import { useMemo, useState } from 'react'
import { useApp, type SourceItem } from '../store'
import { useT } from '../hooks/useT'
import { Knob } from './Knob'
import {
  clampTrackSelection,
  mergedParams,
  NORMALIZE_TRACK_DEFAULT,
  padTracks,
  type AnalysisParams,
  type ConvertParams,
  type ExtractParams,
  type MixdownParams,
  type NormalizeParams,
  type NormalizeTrackCfg,
  type ReplaceParams
} from '../features/params'
import type { AudioStreamInfo, ToolId } from '../../../shared/types'

/** 各功能參數面板;key=tool 讓切換功能時重新初始化 */
export function ParamsPanel(): React.JSX.Element {
  const tool = useApp((s) => s.tool)
  return (
    <section className="params">
      <PanelFor key={tool} tool={tool} />
    </section>
  )
}

function PanelFor({ tool }: { tool: ToolId }): React.JSX.Element {
  switch (tool) {
    case 'analysis':
      return <AnalysisPanel />
    case 'normalize':
      return <NormalizePanel />
    case 'replace':
      return <ReplacePanel />
    case 'extract':
      return <ExtractPanel />
    case 'convert':
      return <ConvertPanel />
    case 'mixdown':
      return <MixdownPanel />
  }
}

/** 讀上次參數 + 寫回 settings 的共用 hook */
function useToolParams<T>(tool: ToolId): [T, (patch: Partial<T>) => void] {
  const saved = useApp((s) => s.settings?.toolParams ?? {})
  const saveToolParams = useApp((s) => s.saveToolParams)
  const [params, setParams] = useState<T>(() => mergedParams<T>(tool, saved))
  const update = (patch: Partial<T>): void => {
    const next = { ...params, ...patch }
    setParams(next)
    saveToolParams(tool, next as Record<string, unknown>)
  }
  return [params, update]
}

/**
 * 逐軌介面的依據:第一個已勾選且 probe 完成的檔案。
 *
 * 影片檔一律展開逐軌介面(即使只有一軌),純音訊檔用單軌的簡潔介面——
 * 音訊檔的「軌」概念對使用者沒有意義,多包一層外框只是雜訊。
 */
interface TrackCtx {
  item: SourceItem | null
  streams: AudioStreamInfo[]
  /** 是否展開逐軌介面 */
  perTrack: boolean
}
function useTrackCtx(): TrackCtx {
  const source = useApp((s) => s.source)
  return useMemo(() => {
    const item = source.find((it) => it.checked && it.info) ?? null
    const streams = item?.info?.audioStreams ?? []
    return { item, streams, perTrack: Boolean(item?.info?.hasVideo) && streams.length > 0 }
  }, [source])
}

/** 軌道標頭:第 N 軌 + codec/聲道/標題/語言 */
function TrackLabel({ st, i }: { st: AudioStreamInfo; i: number }): React.JSX.Element {
  const t = useT()
  return (
    <div className="mt-track-head">
      <b>{t('param.track', { n: i + 1 })}</b>
      <small>
        {st.codec} · {st.channels}ch{st.title ? ` · ${st.title}` : ''}
        {st.language ? ` · ${st.language}` : ''}
      </small>
    </div>
  )
}

/** 勾選式軌道清單(分析/抽取/轉檔共用) */
function TrackChecks({
  streams,
  selected,
  onChange
}: {
  streams: AudioStreamInfo[]
  selected: number[]
  onChange: (tracks: number[]) => void
}): React.JSX.Element {
  const t = useT()
  return (
    <div className="field">
      <span>{t('param.tracks')}</span>
      <div className="track-checks">
        {streams.map((st, i) => (
          <label key={st.index} className="check-inline">
            <input
              type="checkbox"
              checked={selected.includes(i)}
              onChange={(e) =>
                onChange(
                  clampTrackSelection(
                    e.target.checked ? [...selected, i] : selected.filter((n) => n !== i),
                    streams.length
                  )
                )
              }
            />
            {t('param.track', { n: i + 1 })} · {st.codec}
            {st.title ? ` · ${st.title}` : ''}
            {st.language ? ` · ${st.language}` : ''}
          </label>
        ))}
      </div>
    </div>
  )
}

function AnalysisPanel(): React.JSX.Element {
  const t = useT()
  const source = useApp((s) => s.source)
  const toast = useApp((s) => s.toast)
  const [p, update] = useToolParams<AnalysisParams>('analysis')
  const { streams, perTrack } = useTrackCtx()
  const results = source.filter((it) => it.analysis?.length)

  const copyTable = (): void => {
    const lines = results.flatMap((it) =>
      it.analysis!.map(
        (a) =>
          `${it.info?.name ?? it.path}\t${a.track + 1}\t${a.integrated.toFixed(1)}\t${a.range.toFixed(1)}\t${a.truePeak.toFixed(1)}`
      )
    )
    void navigator.clipboard.writeText(`File\tTrack\tLUFS\tLU\tdBTP\n${lines.join('\n')}`)
    toast(t('analysis.copied'))
  }

  return (
    <div className="panel-inner">
      <p className="panel-hint">{t('tool.analysis.desc')}</p>
      {perTrack && (
        <TrackChecks streams={streams} selected={p.tracks} onChange={(tracks) => update({ tracks })} />
      )}
      {results.length > 0 && (
        <button className="mini-btn accent" onClick={copyTable}>
          {t('analysis.copyTable')}
        </button>
      )}
    </div>
  )
}

/** 標準化的一組旋鈕(單軌與逐軌共用) */
function LoudnessKnobs({
  idPrefix,
  lufs,
  tp,
  onChange
}: {
  idPrefix: string
  lufs: number
  tp: number
  onChange: (patch: { lufs?: number; tp?: number }) => void
}): React.JSX.Element {
  const t = useT()
  return (
    <>
      <Knob
        id={`${idPrefix}.lufs`}
        label={t('param.targetLufs')}
        value={lufs}
        onChange={(v) => onChange({ lufs: v })}
        min={-35}
        max={-5}
        stepOptions={[0.5, 0.1, 1]}
        unit="LUFS"
      />
      <Knob
        id={`${idPrefix}.tp`}
        label={t('param.targetTp')}
        value={tp}
        onChange={(v) => onChange({ tp: v })}
        min={-9}
        max={0}
        stepOptions={[0.5, 0.1, 1]}
        unit="dBTP"
      />
    </>
  )
}

function NormalizePanel(): React.JSX.Element {
  const t = useT()
  const [p, update] = useToolParams<NormalizeParams>('normalize')
  const { streams, perTrack } = useTrackCtx()

  if (!perTrack) {
    return (
      <div className="panel-inner">
        <button
          className={`preset-btn${p.lufs === -14 && p.tp === -1 ? ' active' : ''}`}
          onClick={() => update({ lufs: -14, tp: -1 })}
        >
          {t('param.preset.streaming')}
        </button>
        <LoudnessKnobs idPrefix="normalize" lufs={p.lufs} tp={p.tp} onChange={update} />
      </div>
    )
  }

  // 逐軌設定以軌序記憶;寫回時保留超出目前軌數的既有值(換檔案不遺失)
  const tracks = padTracks(p.tracks, streams.length, NORMALIZE_TRACK_DEFAULT)
  const setTrack = (i: number, patch: Partial<NormalizeTrackCfg>): void => {
    const next = padTracks(p.tracks, streams.length, NORMALIZE_TRACK_DEFAULT)
    next[i] = { ...next[i], ...patch }
    update({ tracks: next })
  }
  const multi = streams.length > 1

  return (
    <div className="panel-inner mt-panel">
      <div className="mt-tracks">
        {streams.map((st, i) => (
          <div key={st.index} className="mt-track">
            <TrackLabel st={st} i={i} />
            <select
              value={tracks[i].action}
              onChange={(e) =>
                setTrack(i, { action: e.target.value as NormalizeTrackCfg['action'] })
              }
            >
              <option value="normalize">{t('param.mt.actionNormalize')}</option>
              <option value="keep">{t('param.mt.actionKeep')}</option>
              {multi && <option value="exclude">{t('param.mt.actionExclude')}</option>}
            </select>
            {tracks[i].action === 'normalize' && (
              <div className="mt-knobs">
                <LoudnessKnobs
                  idPrefix={`normalize.track${i}`}
                  lufs={tracks[i].lufs}
                  tp={tracks[i].tp}
                  onChange={(patch) => setTrack(i, patch)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {multi && (
        <div className="mt-side">
          <label className="field">
            <span>{t('param.mt.output')}</span>
            <select
              value={p.output}
              onChange={(e) => update({ output: e.target.value as NormalizeParams['output'] })}
            >
              <option value="mix">{t('param.mt.outputMix')}</option>
              <option value="separate">{t('param.mt.outputSeparate')}</option>
            </select>
          </label>
          {p.output === 'mix' && (
            <label className="check-inline">
              <input
                type="checkbox"
                checked={p.limiter}
                onChange={(e) => update({ limiter: e.target.checked })}
              />
              {t('param.mt.limiter')}
            </label>
          )}
          {p.output === 'mix' && p.limiter && (
            <Knob
              id="normalize.limiterTp"
              label={t('param.targetTp')}
              value={p.limiterTp}
              onChange={(v) => update({ limiterTp: v })}
              min={-9}
              max={0}
              stepOptions={[0.5, 0.1, 1]}
              unit="dBTP"
            />
          )}
        </div>
      )}
    </div>
  )
}

function ReplacePanel(): React.JSX.Element {
  const t = useT()
  const [p, update] = useToolParams<ReplaceParams>('replace')
  const { streams, perTrack } = useTrackCtx()

  return (
    <div className="panel-inner">
      {perTrack && streams.length > 1 && (
        <label className="field">
          <span>{t('param.replace.target')}</span>
          <select
            value={p.targetTrack}
            onChange={(e) => update({ targetTrack: Number(e.target.value) })}
          >
            {streams.map((st, i) => (
              <option key={st.index} value={i}>
                {t('param.track', { n: i + 1 })} · {st.codec}
                {st.title ? ` · ${st.title}` : ''}
              </option>
            ))}
            <option value={-1}>{t('param.replace.targetAll')}</option>
          </select>
        </label>
      )}
      <label className="field">
        <span>{t('param.replace.length')}</span>
        <select
          value={p.length}
          onChange={(e) => {
            const length = e.target.value as ReplaceParams['length']
            // 保留完整影片必須重編音訊 → copy 不可用
            update(
              length === 'keepVideo' && p.codec === 'copy' ? { length, codec: 'aac' } : { length }
            )
          }}
        >
          <option value="keepVideo">{t('param.replace.keepVideo')}</option>
          <option value="shortest">{t('param.replace.shortest')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t('param.replace.codec')}</span>
        <select
          value={p.codec}
          onChange={(e) => update({ codec: e.target.value as ReplaceParams['codec'] })}
        >
          <option value="aac">AAC 320k</option>
          <option value="pcm">PCM 16-bit</option>
          {p.length === 'shortest' && <option value="copy">Copy</option>}
        </select>
      </label>
      <p className="panel-hint">{t('param.replace.needAudio')}</p>
    </div>
  )
}

function ExtractPanel(): React.JSX.Element {
  const t = useT()
  const [p, update] = useToolParams<ExtractParams>('extract')
  const { streams, perTrack } = useTrackCtx()

  return (
    <div className="panel-inner">
      <label className="field">
        <span>{t('param.extract.mode')}</span>
        <select
          value={p.mode}
          onChange={(e) => update({ mode: e.target.value as ExtractParams['mode'] })}
        >
          <option value="lossless">{t('param.extract.lossless')}</option>
          <option value="wav">WAV (24-bit)</option>
          <option value="mp3">MP3 320k</option>
          <option value="flac">FLAC</option>
        </select>
      </label>
      {perTrack && (
        <TrackChecks streams={streams} selected={p.tracks} onChange={(tracks) => update({ tracks })} />
      )}
    </div>
  )
}

function MixdownPanel(): React.JSX.Element {
  const t = useT()
  const [p, update] = useToolParams<MixdownParams>('mixdown')
  return (
    <div className="panel-inner">
      <label className="field">
        <span>{t('param.convert.format')}</span>
        <select value={p.format} onChange={(e) => update({ format: e.target.value as MixdownParams['format'] })}>
          <option value="wav">WAV (24-bit)</option>
          <option value="mp3">MP3 320k</option>
          <option value="aac">AAC 256k (.m4a)</option>
          <option value="flac">FLAC</option>
        </select>
      </label>
      <label className="field">
        <span>{t('param.mixdown.duration')}</span>
        <select
          value={p.duration}
          onChange={(e) => update({ duration: e.target.value as MixdownParams['duration'] })}
        >
          <option value="longest">{t('param.mixdown.duration.longest')}</option>
          <option value="shortest">{t('param.mixdown.duration.shortest')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t('param.convert.sampleRate')}</span>
        <select
          value={p.sampleRate}
          onChange={(e) => update({ sampleRate: Number(e.target.value) as MixdownParams['sampleRate'] })}
        >
          <option value={0}>{t('param.convert.keepSr')}</option>
          <option value={44100}>44.1 kHz</option>
          <option value={48000}>48 kHz</option>
          <option value={96000}>96 kHz</option>
        </select>
      </label>
      <div className="field">
        <label className="check-inline">
          <input
            type="checkbox"
            checked={p.autoLevel}
            onChange={(e) => update({ autoLevel: e.target.checked })}
          />
          {t('param.mixdown.autoLevel')}
        </label>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={p.limiter}
            onChange={(e) => update({ limiter: e.target.checked })}
          />
          {t('param.mt.limiter')}
        </label>
      </div>
    </div>
  )
}

function ConvertPanel(): React.JSX.Element {
  const t = useT()
  const [p, update] = useToolParams<ConvertParams>('convert')
  const { streams, perTrack } = useTrackCtx()

  return (
    <div className="panel-inner">
      <label className="field">
        <span>{t('param.convert.format')}</span>
        <select value={p.format} onChange={(e) => update({ format: e.target.value as ConvertParams['format'] })}>
          <option value="wav">WAV</option>
          <option value="mp3">MP3</option>
          <option value="aac">AAC (.m4a)</option>
          <option value="flac">FLAC</option>
        </select>
      </label>

      {p.format === 'wav' && (
        <label className="field">
          <span>{t('param.convert.bitDepth')}</span>
          <select value={p.wavDepth} onChange={(e) => update({ wavDepth: e.target.value as ConvertParams['wavDepth'] })}>
            <option value="16">16-bit</option>
            <option value="24">24-bit</option>
            <option value="32f">32-bit float</option>
          </select>
        </label>
      )}

      {p.format === 'mp3' && (
        <>
          <label className="field">
            <span>{t('param.convert.mp3Mode')}</span>
            <select value={p.mp3Mode} onChange={(e) => update({ mp3Mode: e.target.value as ConvertParams['mp3Mode'] })}>
              <option value="cbr">CBR</option>
              <option value="vbr">VBR</option>
            </select>
          </label>
          {p.mp3Mode === 'cbr' ? (
            <label className="field">
              <span>{t('param.convert.bitrate')}</span>
              <select
                value={p.mp3Bitrate}
                onChange={(e) => update({ mp3Bitrate: Number(e.target.value) as ConvertParams['mp3Bitrate'] })}
              >
                {[128, 192, 256, 320].map((b) => (
                  <option key={b} value={b}>{b} kbps</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <span>VBR</span>
              <select
                value={p.mp3VbrQuality}
                onChange={(e) => update({ mp3VbrQuality: Number(e.target.value) as ConvertParams['mp3VbrQuality'] })}
              >
                <option value={0}>V0</option>
                <option value={2}>V2</option>
              </select>
            </label>
          )}
        </>
      )}

      {p.format === 'aac' && (
        <label className="field">
          <span>{t('param.convert.bitrate')}</span>
          <select
            value={p.aacBitrate}
            onChange={(e) => update({ aacBitrate: Number(e.target.value) as ConvertParams['aacBitrate'] })}
          >
            {[128, 192, 256, 320].map((b) => (
              <option key={b} value={b}>{b} kbps</option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>{t('param.convert.sampleRate')}</span>
        <select
          value={p.sampleRate}
          onChange={(e) => update({ sampleRate: Number(e.target.value) as ConvertParams['sampleRate'] })}
        >
          <option value={0}>{t('param.convert.keepSr')}</option>
          <option value={44100}>44.1 kHz</option>
          <option value={48000}>48 kHz</option>
          <option value={96000}>96 kHz</option>
        </select>
      </label>

      <label className="field">
        <span>{t('param.convert.channels')}</span>
        <select
          value={p.channels}
          onChange={(e) => update({ channels: Number(e.target.value) as ConvertParams['channels'] })}
        >
          <option value={0}>{t('param.convert.keepCh')}</option>
          <option value={2}>{t('param.convert.stereo')}</option>
          <option value={1}>{t('param.convert.mono')}</option>
        </select>
      </label>

      {perTrack && (
        <TrackChecks streams={streams} selected={p.tracks} onChange={(tracks) => update({ tracks })} />
      )}
    </div>
  )
}
