import { useApp } from '../store'
import { useT } from '../hooks/useT'

export function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const hardware = useApp((s) => s.hardware)
  const saveSettings = useApp((s) => s.saveSettings)
  const toast = useApp((s) => s.toast)
  if (!settings) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('settings.title')}</h2>
          <button className="row-x" onClick={onClose}>✕</button>
        </div>

        <label className="field">
          <span>{t('settings.output')}</span>
          <select
            value={settings.outputMode}
            onChange={(e) => void saveSettings({ outputMode: e.target.value as 'source' | 'fixed' })}
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
          <span>{t('settings.theme')}</span>
          <select
            value={settings.theme}
            onChange={(e) => void saveSettings({ theme: e.target.value as typeof settings.theme })}
          >
            <option value="system">{t('settings.theme.system')}</option>
            <option value="light">{t('settings.theme.light')}</option>
            <option value="dark">{t('settings.theme.dark')}</option>
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

        <label className="check-inline">
          <input
            type="checkbox"
            checked={settings.haptics}
            onChange={(e) => void saveSettings({ haptics: e.target.checked })}
          />
          {t('settings.haptics')}
        </label>
        {settings.haptics && (
          <>
            <div className="field field-row">
              <span>{t('settings.haptics.waveform')}</span>
              <select
                value={settings.hapticWaveform}
                onChange={(e) => void saveSettings({ hapticWaveform: Number(e.target.value) })}
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
          </>
        )}

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
      </div>
    </div>
  )
}
