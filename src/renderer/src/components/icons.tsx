/** 單色 SVG 圖示集:stroke = currentColor,隨主題與文字顏色連動 */
interface IconProps {
  size?: number
}

function base(size: number, children: React.ReactNode, filled = false): React.JSX.Element {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const IconAnalysis = ({ size = 18 }: IconProps): React.JSX.Element =>
  base(size, <><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></>)

export const IconNormalize = ({ size = 18 }: IconProps): React.JSX.Element =>
  base(size, <>
    <line x1="6" y1="4" x2="6" y2="20" /><circle cx="6" cy="9" r="2.2" />
    <line x1="12" y1="4" x2="12" y2="20" /><circle cx="12" cy="15" r="2.2" />
    <line x1="18" y1="4" x2="18" y2="20" /><circle cx="18" cy="7" r="2.2" />
  </>)

export const IconReplace = ({ size = 18 }: IconProps): React.JSX.Element =>
  base(size, <><path d="M17 5H7l3-3M7 5l3 3" /><path d="M7 19h10l-3 3M17 19l-3-3" /><line x1="4" y1="12" x2="20" y2="12" strokeDasharray="2 3" /></>)

export const IconExtract = ({ size = 18 }: IconProps): React.JSX.Element =>
  base(size, <><path d="M12 14V3" /><polyline points="8 7 12 3 16 7" /><path d="M4 15v5h16v-5" /></>)

export const IconConvert = ({ size = 18 }: IconProps): React.JSX.Element =>
  base(size, <><path d="M20 8a8 8 0 0 0-14.9-1" /><polyline points="4 3 4.9 7.4 9.3 6.6" /><path d="M4 16a8 8 0 0 0 14.9 1" /><polyline points="20 21 19.1 16.6 14.7 17.4" /></>)

export const IconMultitrack = ({ size = 18 }: IconProps): React.JSX.Element =>
  base(size, <>
    <line x1="3" y1="6" x2="21" y2="6" /><circle cx="9" cy="6" r="2.2" />
    <line x1="3" y1="12" x2="21" y2="12" /><circle cx="15" cy="12" r="2.2" />
    <line x1="3" y1="18" x2="21" y2="18" /><circle cx="7" cy="18" r="2.2" />
  </>)

// 實心齒輪外形(與太陽圖示的細放射線明顯不同,避免混淆)
export const IconGear = ({ size = 16 }: IconProps): React.JSX.Element =>
  base(
    size,
    <path d="M19.14,12.94a7.14,7.14,0,0,0,.05-1,7.14,7.14,0,0,0-.05-1l2.11-1.65a.5.5,0,0,0,.12-.64l-2-3.46a.5.5,0,0,0-.6-.22l-2.49,1a7.3,7.3,0,0,0-1.73-1l-.38-2.65A.5.5,0,0,0,14,2H10a.5.5,0,0,0-.5.42L9.12,5.07a7.3,7.3,0,0,0-1.73,1l-2.49-1a.5.5,0,0,0-.6.22l-2,3.46a.5.5,0,0,0,.12.64L4.53,10.94a7.14,7.14,0,0,0,0,2L2.42,14.59a.5.5,0,0,0-.12.64l2,3.46a.5.5,0,0,0,.6.22l2.49-1a7.3,7.3,0,0,0,1.73,1l.38,2.65A.5.5,0,0,0,10,22h4a.5.5,0,0,0,.5-.42l.38-2.65a7.3,7.3,0,0,0,1.73-1l2.49,1a.5.5,0,0,0,.6-.22l2-3.46a.5.5,0,0,0-.12-.64ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" />,
    true
  )

export const IconSun = ({ size = 16 }: IconProps): React.JSX.Element =>
  base(size, <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </>)

export const IconMoon = ({ size = 16 }: IconProps): React.JSX.Element =>
  base(size, <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />)

export const IconAutoTheme = ({ size = 16 }: IconProps): React.JSX.Element =>
  base(size, <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></>)

export const IconLogo = ({ size = 18 }: IconProps): React.JSX.Element =>
  base(size, <>
    <rect x="3" y="10" width="2.6" height="4" rx="1" />
    <rect x="7.6" y="7" width="2.6" height="10" rx="1" />
    <rect x="12.2" y="4" width="2.6" height="16" rx="1" />
    <rect x="16.8" y="8" width="2.6" height="8" rx="1" />
  </>, true)

export const IconDrop = ({ size = 30 }: IconProps): React.JSX.Element =>
  base(size, <><path d="M12 3v11" /><polyline points="8 10 12 14 16 10" /><path d="M4 17v3h16v-3" /></>)

export const IconNote = ({ size = 13 }: IconProps): React.JSX.Element =>
  base(size, <><path d="M9 18V5l10-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>)

export const IconWarn = ({ size = 13 }: IconProps): React.JSX.Element =>
  base(size, <><path d="M12 3.5 2.5 20h19z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="16.8" x2="12" y2="17" /></>)

export const IconStop = ({ size = 13 }: IconProps): React.JSX.Element =>
  base(size, <rect x="6" y="6" width="12" height="12" rx="1.5" />)

export const IconCheck = ({ size = 30 }: IconProps): React.JSX.Element =>
  base(size, <polyline points="4 13 9 18 20 6" />)

export const IconFolder = ({ size = 14 }: IconProps): React.JSX.Element =>
  base(size, <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />)

export const IconArrowLeft = ({ size = 14 }: IconProps): React.JSX.Element =>
  base(size, <><line x1="20" y1="12" x2="5" y2="12" /><polyline points="11 6 5 12 11 18" /></>)

export const IconPlay = ({ size = 14 }: IconProps): React.JSX.Element =>
  base(size, <path d="M6 4.5v15l13-7.5z" />, true)

export const IconMixdown = ({ size = 18 }: IconProps): React.JSX.Element =>
  base(size, <>
    <path d="M4 5h7M4 12h5M4 19h7" />
    <path d="M11 5c4 0 4 7 8 7M9 12h10M11 19c4 0 4-7 8-7" />
    <polyline points="16 9 19 12 16 15" />
  </>)

/* 視窗控制(無邊框標題列用,線條較細) */
export const IconWinMin = ({ size = 12 }: IconProps): React.JSX.Element =>
  base(size, <line x1="4" y1="12" x2="20" y2="12" strokeWidth="1.6" />)

export const IconWinMax = ({ size = 12 }: IconProps): React.JSX.Element =>
  base(size, <rect x="5" y="5" width="14" height="14" rx="1" strokeWidth="1.6" />)

export const IconWinRestore = ({ size = 12 }: IconProps): React.JSX.Element =>
  base(size, <>
    <rect x="4" y="8" width="12" height="12" rx="1" strokeWidth="1.6" />
    <path d="M8 8V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3" strokeWidth="1.6" />
  </>)

export const IconWinClose = ({ size = 12 }: IconProps): React.JSX.Element =>
  base(size, <path d="M5 5l14 14M19 5L5 19" strokeWidth="1.6" />)
