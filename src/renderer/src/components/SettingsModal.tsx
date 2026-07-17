import { useState } from 'react'
import { useApp } from '../store'
import { useT } from '../hooks/useT'
import { ACCENTS } from '../../../shared/types'
import { FreeKnob } from './FreeKnob'

const TABS = ['general', 'appearance', 'haptics', 'hardware'] as const
type Tab = (typeof TABS)[number]

export function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const hardware = useApp((s) => s.hardware)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)
  const sounds = useApp((s) => s.sounds)
  const playSound = useApp((s) => s.playSound)
  const [tab, setTab] = useState<Tab>('general')
  if (!settings) return null

  const effectiveSoundId = settings.soundId || sounds[0]?.id || 'none'

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
                      className={`accent-swatch${settings.accent === hex ? ' active' : ''}`}
                      style={{ background: hex }}
                      title={`${hex}(${t('settings.accent.deleteHint')})`}
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
                  <label className="accent-swatch accent-add" title={t('settings.accent.custom')}>
                    +
                    <input
                      type="color"
                      value={settings.accent.startsWith('#') ? settings.accent : '#4f8cff'}
                      onChange={(e) => void saveSettings({ accent: e.target.value })}
                    />
                  </label>
                  {settings.accent.startsWith('#') &&
                    !settings.customAccents.includes(settings.accent) && (
                      <button
                        className="mini-btn accent"
                        onClick={() => {
                          if (settings.customAccents.length >= 5) {
                            toast(t('toast.customFull'))
                            return
                          }
                          void saveSettings({
                            customAccents: [...settings.customAccents, settings.accent]
                          })
                        }}
                      >
                        {t('settings.accent.save')}
                      </button>
                    )}
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
