import { useMemo, useState } from 'react'
import { useApp, type SourceItem } from '../store'
import { useT } from '../hooks/useT'
import { Knob } from './Knob'
import {
  mergedParams,
  MULTITRACK_TRACK_DEFAULT,
  type ConvertParams,
  type ExtractParams,
  type MixdownParams,
  type MultitrackParams,
  type NormalizeParams,
  type ReplaceParams
} from '../features/params'
import type { ToolId } from '../../../shared/types'

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
    case 'multitrack':
      return <MultitrackPanel />
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

function AnalysisPanel(): React.JSX.Element {
  const t = useT()
  const source = useApp((s) => s.source)
  const toast = useApp((s) => s.toast)
  const results = source.filter((it) => it.analysis)

  const copyTable = (): void => {
    const lines = results.map(
      (it) =>
        `${it.info?.name ?? it.path}\t${it.analysis!.integrated.toFixed(1)}\t${it.analysis!.range.toFixed(1)}\t${it.analysis!.truePeak.toFixed(1)}`
    )
    void navigator.clipboard.writeText(
      `File\tLUFS\tLU\tdBTP\n${lines.join('\n')}`
    )
    toast(t('analysis.copied'))
  }

  return (
    <div className="panel-inner">
      <p className="panel-hint">{t('tool.analysis.desc')}</p>
      {results.length > 0 && (
        <button className="mini-btn accent" onClick={copyTable}>
          {t('analysis.copyTable')}
        </button>
      )}
    </div>
  )
}

function NormalizePanel(): React.JSX.Element {
  const t = useT()
  const [p, update] = useToolParams<NormalizeParams>('normalize')
  return (
    <div className="panel-inner">
      <button
        className={`preset-btn${p.lufs === -14 && p.tp === -1 ? ' active' : ''}`}
        onClick={() => update({ lufs: -14, tp: -1 })}
      >
        {t('param.preset.streaming')}
      </button>
      <Knob
        id="normalize.lufs"
        label={t('param.targetLufs')}
        value={p.lufs}
        onChange={(v) => update({ lufs: v })}
        min={-35}
        max={-5}
        stepOptions={[0.5, 0.1, 1]}
        unit="LUFS"
      />
      <Knob
        id="normalize.tp"
        label={t('param.targetTp')}
        value={p.tp}
        onChange={(v) => update({ tp: v })}
        min={-9}
        max={0}
        stepOptions={[0.5, 0.1, 1]}
        unit="dBTP"
      />
    </div>
  )
}

function ReplacePanel(): React.JSX.Element {
  const t = useT()
  const [p, update] = useToolParams<ReplaceParams>('replace')
  return (
    <div className="panel-inner">
      <label className="field">
        <span>{t('param.replace.length')}</span>
        <select
          value={p.length}
          onChange={(e) => {
            const length = e.target.value as ReplaceParams['length']
            // 保留完整影片必須重編音訊 → copy 不可用
            update(length === 'keepVideo' && p.codec === 'copy' ? { length, codec: 'aac' } : { length })
          }}
        >
          <option value="keepVideo">{t('param.replace.keepVideo')}</option>
          <option value="shortest">{t('param.replace.shortest')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t('param.replace.codec')}</span>
        <select value={p.codec} onChange={(e) => update({ codec: e.target.value as ReplaceParams['codec'] })}>
          <option value="aac">AAC 320k</option>
          <option value="pcm">PCM 16-bit</option>
          {p.length === 'shortest' && <option value="copy">Copy</option>}
        </select>
      </label>
      <p className="panel-hint">{t('param.replace.needAudio')}</p>
    </div>
  )
}

/** 取第一個已勾選且 probe 完成的檔案(軌道面板的依據) */
function useFirstChecked(): SourceItem | null {
  const source = useApp((s) => s.source)
  return useMemo(() => source.find((it) => it.checked && it.info) ?? null, [source])
}

function ExtractPanel(): React.JSX.Element {
  const t = useT()
  const [p, update] = useToolParams<ExtractParams>('extract')
  const first = useFirstChecked()
  const streams = first?.info?.audioStreams ?? []

  return (
    <div className="panel-inner">
      <label className="field">
        <span>{t('param.extract.mode')}</span>
        <select value={p.mode} onChange={(e) => update({ mode: e.target.value as ExtractParams['mode'] })}>
          <option value="lossless">{t('param.extract.lossless')}</option>
          <option value="wav">WAV (24-bit)</option>
          <option value="mp3">MP3 320k</option>
          <option value="flac">FLAC</option>
        </select>
      </label>
      {streams.length > 1 && (
        <div className="field">
          <span>{t('param.extract.tracks')}</span>
          <div className="track-checks">
            {streams.map((st) => (
              <label key={st.index} className="check-inline">
                <input
                  type="checkbox"
                  checked={p.tracks.includes(st.index)}
                  onChange={(e) => {
                    const tracks = e.target.checked
                      ? [...p.tracks, st.index].sort()
                      : p.tracks.filter((n) => n !== st.index)
                    update({ tracks: tracks.length ? tracks : [0] })
                  }}
                />
                {t('param.extract.track', { n: st.index + 1 })} · {st.codec}
                {st.language ? ` · ${st.language}` : ''}
              </label>
            ))}
          </div>
        </div>
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
    </div>
  )
}

function MultitrackPanel(): React.JSX.Element {
  const t = useT()
  const [p, update] = useToolParams<MultitrackParams>('multitrack')
  const first = useFirstChecked()
  const streams = first?.info?.hasVideo ? first.info.audioStreams : []

  if (!streams.length) {
    return (
      <div className="panel-inner">
        <p className="panel-hint">{t('param.mt.needVideo')}</p>
      </div>
    )
  }

  // 依檔案軌數延展設定(每軌記憶以軌序為 key)
  const tracks = streams.map((_, i) => p.tracks[i] ?? MULTITRACK_TRACK_DEFAULT)

  // 寫回時保留超出目前檔案軌數的既有記憶(§9-18:每軌記憶獨立於檔案)
  const setTrack = (i: number, patch: Partial<(typeof tracks)[number]>): void => {
    const next = [...p.tracks]
    while (next.length < streams.length) next.push(MULTITRACK_TRACK_DEFAULT)
    next[i] = { ...next[i], ...patch }
    update({ tracks: next })
  }

  return (
    <div className="panel-inner mt-panel">
      <div className="mt-tracks">
        {streams.map((st, i) => (
          <div key={st.index} className="mt-track">
            <div className="mt-track-head">
              <b>{t('param.mt.track', { n: i + 1 })}</b>
              <small>
                {st.codec} · {st.channels}ch{st.title ? ` · ${st.title}` : ''}
                {st.language ? ` · ${st.language}` : ''}
              </small>
            </div>
            <select
              value={tracks[i].action}
              onChange={(e) => setTrack(i, { action: e.target.value as (typeof tracks)[number]['action'] })}
            >
              <option value="normalize">{t('param.mt.actionNormalize')}</option>
              <option value="keep">{t('param.mt.actionKeep')}</option>
              <option value="exclude">{t('param.mt.actionExclude')}</option>
            </select>
            {tracks[i].action === 'normalize' && (
              <div className="mt-knobs">
                <Knob
                  id={`mt.track${i}.lufs`}
                  label={t('param.targetLufs')}
                  value={tracks[i].lufs}
                  onChange={(v) => setTrack(i, { lufs: v })}
                  min={-35}
                  max={-5}
                  stepOptions={[0.5, 0.1, 1]}
                  unit="LUFS"
                />
                <Knob
                  id={`mt.track${i}.tp`}
                  label={t('param.targetTp')}
                  value={tracks[i].tp}
                  onChange={(v) => setTrack(i, { tp: v })}
                  min={-9}
                  max={0}
                  stepOptions={[0.5, 0.1, 1]}
                  unit="dBTP"
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-side">
        <label className="field">
          <span>{t('param.mt.output')}</span>
          <select
            value={p.output}
            onChange={(e) => update({ output: e.target.value as MultitrackParams['output'] })}
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
            id="mt.limiterTp"
            label={t('param.targetTp')}
            value={p.limiterTp}
            onChange={(v) => update({ limiterTp: v })}
            min={-9}
            max={0}
            stepOptions={[0.5, 0.1, 1]}
            unit="dBTP"
          />
        )}
        <p className="panel-hint">{t('param.mt.trackCountNote')}</p>
      </div>
    </div>
  )
}
