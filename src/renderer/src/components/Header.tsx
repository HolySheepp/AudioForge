import { useEffect, useState } from 'react'
import { useT } from '../hooks/useT'
import { IconLogo, IconWinClose, IconWinMax, IconWinMin, IconWinRestore } from './icons'

/** 無邊框視窗的自製標題列:可拖曳,含最小化/最大化/關閉 */
export function Header(): React.JSX.Element {
  const t = useT()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => window.api.onWindowMaximized(setMaximized), [])

  return (
    <header className="header titlebar">
      <div className="header-brand">
        <span className="header-logo">
          <IconLogo />
        </span>
        <h1>{t('app.name')}</h1>
      </div>
      <div className="win-controls">
        <button title={t('window.minimize')} onClick={() => window.api.winMinimize()}>
          <IconWinMin />
        </button>
        <button
          title={maximized ? t('window.restore') : t('window.maximize')}
          onClick={() => window.api.winToggleMaximize()}
        >
          {maximized ? <IconWinRestore /> : <IconWinMax />}
        </button>
        <button
          className="win-close"
          title={t('window.close')}
          onClick={() => window.api.winClose()}
        >
          <IconWinClose />
        </button>
      </div>
    </header>
  )
}
