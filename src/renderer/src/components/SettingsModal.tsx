import { useState } from 'react'
import { useApp } from '../store'
import { useT } from '../hooks/useT'
import type { I18nKey } from '../i18n'
import { ACCENTS, ANALYSIS_METRICS, MAX_ANALYSIS_LOAD } from '../../../shared/types'
import { FreeKnob } from './FreeKnob'
import { ColorPicker } from './ColorPicker'

const TABS = ['general', 'appearance', 'analysis', 'haptics', 'hardware'] as const
type Tab = (typeof TABS)[number]

/** 負擔條各指標的固定顏色(不設圖例,靠顏色與勾選時的增長自行對應) */
const LOAD_COLORS: Record<string, string> = {
  lufs: '#4f8cff',
  lra: '#42d65a',
  truePeak: '#faad42',
  crest: '#f76495'
}

export function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const hardware = useApp((s) => s.hardware)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)
  const sounds = useApp((s) => s.sounds)
  const playSound = useApp((s) => s.playSound)
  const [tab, setTab] = useState<Tab>('general')
  // 開調色盤時記住原本的副色,Cancel 時還原;picking 期間隱藏設定與遮罩
  const [picking, setPicking] = useState<string | null>(null)
  if (!settings) return null

  const effectiveSoundId = settings.soundId || sounds[0]?.id || 'none'

  // 調色盤開啟:只渲染調色盤,設定面板與變暗遮罩都收起,讓使用者以原亮度預覽主界面
  if (picking !== null) {
    return (
      <ColorPicker
        initial={settings.accent.startsWith('#') ? settings.accent : '#4f8cff'}
        onPreview={(hex) => void saveSettings({ accent: hex })}
        onCancel={() => {
          void saveSettings({ accent: picking })
          setPicking(null)
        }}
        onSave={(hex) => {
          if (settings.customAccents.includes(hex)) {
            void saveSettings({ accent: hex })
          } else if (settings.customAccents.length >= 5) {
            void saveSettings({ accent: hex })
            toast(t('toast.customFull'))
          } else {
            void saveSettings({ accent: hex, customAccents: [...settings.customAccents, hex] })
          }
          setPicking(null)
        }}
      />
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('settings.title')}</h2>
          <button className="row-x" onClick={onClose}>✕</button>
        </div>

        <div className="modal-tabs">
          {TABS.map((id) => (
            <button
              key={id}
              className={`modal-tab${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {t(`settings.tab.${id}`)}
            </button>
          ))}
        </div>

        <div className="modal-tab-body">
          {tab === 'general' && (
            <>
              <label className="field">
                <span>{t('settings.output')}</span>
                <select
                  value={settings.outputMode}
                  onChange={(e) =>
                    void saveSettings({ outputMode: e.target.value as 'source' | 'fixed' })
                  }
                >
                  <option value="source">{t('settings.output.source')}</option>
                  <option value="fixed">{t('settings.output.fixed')}</option>
                </select>
              </label>
              {settings.outputMode === 'fixed' && (
                <div className="field field-row">
                  <input readOnly value={settings.outputDir} placeholder={t('common.none')} />
                  <button
                    className="mini-btn"
                    onClick={() => {
                      void window.api.pickDir().then((dir) => {
                        if (dir) void saveSettings({ outputDir: dir })
                      })
                    }}
                  >
                    {t('common.browse')}
                  </button>
                </div>
              )}

              <label className="field">
                <span>{t('settings.concurrency')}</span>
                <select
                  value={settings.concurrency}
                  onChange={(e) => void saveSettings({ concurrency: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>{t('settings.language')}</span>
                <select
                  value={settings.language}
                  onChange={(e) => void saveSettings({ language: e.target.value as 'zh' | 'en' })}
                >
                  <option value="zh">繁體中文</option>
                  <option value="en">English</option>
                </select>
              </label>
            </>
          )}

          {tab === 'appearance' && (
            <>
              <label className="field">
                <span>{t('settings.theme')}</span>
                <select
                  value={settings.theme}
                  onChange={(e) =>
                    void saveSettings({ theme: e.target.value as typeof settings.theme })
                  }
                >
                  <option value="system">{t('settings.theme.system')}</option>
                  <option value="light">{t('settings.theme.light')}</option>
                  <option value="dark">{t('settings.theme.dark')}</option>
                </select>
              </label>

              <div className="field">
                <span>{t('settings.accent')}</span>
                <div className="accent-swatches">
                  {ACCENTS.map((a) => (
                    <button
                      key={a}
                      className={`accent-swatch${settings.accent === a ? ' active' : ''}`}
                      data-accent-preview={a}
                      title={t(`settings.accent.${a}`)}
                      onClick={() => void saveSettings({ accent: a })}
                    />
                  ))}
                  {settings.customAccents.map((hex) => (
                    <button
                      key={hex}
                      className={`accent-swatch accent-custom${settings.accent === hex ? ' active' : ''}`}
                      style={{ background: hex }}
                      title={t('settings.accent.customHint')}
                      onClick={() => void saveSettings({ accent: hex })}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        void saveSettings({
                          customAccents: settings.customAccents.filter((c) => c !== hex),
                          ...(settings.accent === hex ? { accent: 'blue' } : {})
                        })
                      }}
                    />
                  ))}
                  <button
                    className="accent-swatch accent-add"
                    title={t('settings.accent.custom')}
                    onClick={() => setPicking(settings.accent)}
                  >
                    <span className="accent-add-plus" />
                  </button>
                </div>
              </div>

              {sounds.length === 0 ? (
                <div className="field">
                  <span>{t('settings.sound.pick')}</span>
                  <span className="panel-hint">{t('settings.sound.empty')}</span>
                </div>
              ) : (
                <>
                  <div className="field field-row">
                    <span>{t('settings.sound.pick')}</span>
                    <select
                      value={effectiveSoundId}
                      onChange={(e) => void saveSettings({ soundId: e.target.value })}
                    >
                      <option value="none">{t('settings.sound.noneOption')}</option>
                      {sounds.map((s) => (
                        <option key={s.id} value={s.id}>
                          {settings.language === 'zh' ? s.zhName : s.enName}
                        </option>
                      ))}
                    </select>
                    {effectiveSoundId !== 'none' && (
                      <button className="mini-btn" onClick={() => playSound(effectiveSoundId)}>
                        {t('settings.sound.test')}
                      </button>
                    )}
                  </div>
                  {effectiveSoundId !== 'none' && (
                    <label className="field">
                      <span>{t('settings.sound.timing')}</span>
                      <select
                        value={settings.soundTiming}
                        onChange={(e) =>
                          void saveSettings({ soundTiming: e.target.value as 'perFile' | 'batch' })
                        }
                      >
                        <option value="perFile">{t('settings.sound.timing.perFile')}</option>
                        <option value="batch">{t('settings.sound.timing.batch')}</option>
                      </select>
                    </label>
                  )}
                  <p className="panel-hint sound-credit">{t('settings.sound.credit')}</p>
                </>
              )}
            </>
          )}

          {tab === 'analysis' && (
            <>
              <span className="field-label">{t('settings.analysis.metrics')}</span>
              {ANALYSIS_METRICS.map((m) => {
                const on = settings.analysisMetrics.includes(m.id)
                return (
                  <label key={m.id} className="check-inline">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...settings.analysisMetrics, m.id]
                          : settings.analysisMetrics.filter((x) => x !== m.id)
                        void saveSettings({ analysisMetrics: next })
                      }}
                    />
                    {t(`metric.${m.id}` as I18nKey)}
                    <span className="metric-unit">{m.unit}</span>
                    {m.needsAstats && <span className="metric-tag">{t('settings.analysis.extraPass')}</span>}
                  </label>
                )
              })}

              <div className="load-row">
                <span className="field-label">{t('settings.analysis.load')}</span>
                <div className="load-bar">
                  {ANALYSIS_METRICS.map((m) =>
                    m.load > 0 && settings.analysisMetrics.includes(m.id) ? (
                      <div
                        key={m.id}
                        className="load-seg"
                        style={{
                          width: `${(m.load / MAX_ANALYSIS_LOAD) * 100}%`,
                          background: LOAD_COLORS[m.id]
                        }}
                      />
                    ) : null
                  )}
                </div>
                <span className="load-pct">
                  {Math.round(
                    (ANALYSIS_METRICS.filter((m) => settings.analysisMetrics.includes(m.id)).reduce(
                      (s, m) => s + m.load,
                      0
                    ) /
                      MAX_ANALYSIS_LOAD) *
                      100
                  )}
                  %
                </span>
              </div>
              <p className="panel-hint">{t('settings.analysis.hint')}</p>
            </>
          )}

          {tab === 'haptics' && (
            <>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={settings.haptics}
                  onChange={(e) => void saveSettings({ haptics: e.target.checked })}
                />
                {t('settings.haptics')}
              </label>
              {settings.haptics && (
                <div className="haptics-row">
                  <div className="haptics-controls">
                    <div className="field field-row">
                      <span>{t('settings.haptics.waveform')}</span>
                      <select
                        value={settings.hapticWaveform}
                        onChange={(e) =>
                          void saveSettings({ hapticWaveform: Number(e.target.value) })
                        }
                      >
                        {Array.from({ length: 16 }, (_, i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                      <button
                        className="mini-btn"
                        onClick={() => {
                          void window.api.hapticTest().then((ok) => {
                            toast(t(ok ? 'toast.hapticOk' : 'toast.hapticFail'))
                          })
                        }}
                      >
                        {t('settings.haptics.test')}
                      </button>
                    </div>
                    <p className="panel-hint">{t('settings.haptics.hint')}</p>
                  </div>
                  <FreeKnob label={t('settings.haptics.tryKnob')} />
                </div>
              )}
            </>
          )}

          {tab === 'hardware' && (
            <>
              <label className="field">
                <span>{t('settings.hwAccel')}</span>
                <select
                  value={settings.hwAccel}
                  onChange={(e) => void saveSettings({ hwAccel: e.target.value as 'auto' | 'off' })}
                >
                  <option value="auto">{t('settings.hwAccel.auto')}</option>
                  <option value="off">{t('settings.hwAccel.off')}</option>
                </select>
              </label>

              <div className="settings-hw">
                <div>
                  <span>{t('settings.hwDetected')}</span>
                  <b>{hardware?.gpuNames.join(', ') || '…'}</b>
                </div>
                <div>
                  <span>{t('settings.hwEncoder')}</span>
                  <b>
                    {settings.hwAccel === 'off'
                      ? t('settings.hwEncoderNone')
                      : hardware?.chosenEncoder ?? t('settings.hwEncoderNone')}
                  </b>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
