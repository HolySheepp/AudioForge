import { app, BrowserWindow, protocol, shell, dialog, nativeTheme } from 'electron'
import { join, extname } from 'path'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { registerIpc } from './ipc'
import { initCache } from './cache'
import { registerAllTools } from './tools'
import { queue } from './queue'
import { getSettings } from './settings'

// media:// 自訂協定:讓 renderer 的 <video>/<audio> 能安全地串流本地媒體檔
// URL 形式:media:///C:/path/to/file.mp4(路徑經 encodeURIComponent 逐段編碼)
// standard: true 是關鍵——非標準 scheme 在 Chromium 媒體管線中拿不到完整的
// byte-range 支援,影片會出現 PIPELINE_ERROR_READ、時長誤判、seek 失效
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

let mainWindow: BrowserWindow | null = null

// 與 global.css 的 --bg 完全一致;原生視窗背景色需跟著主題同步,
// 否則切換主題重繪的瞬間會露出底色,看起來像閃一下
const THEME_BG = { light: '#f4f5f8', dark: '#16181d' } as const

export function resolveThemeBg(theme: 'system' | 'light' | 'dark'): string {
  if (theme === 'system') return nativeTheme.shouldUseDarkColors ? THEME_BG.dark : THEME_BG.light
  return THEME_BG[theme]
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'AudioForge',
    // 無邊框:原生標題列與 app 風格差太多;自製 header 兼任標題列(拖曳/視窗控制)
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: resolveThemeBg(getSettings().theme),
    // 打包版圖示已嵌入 exe;開發模式(npx electron .)額外指定,避免顯示 Electron 預設圖示
    icon: app.isPackaged ? undefined : join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 最大化狀態推給 renderer(切換「最大化/還原」按鈕圖示)
  const sendMaximized = (v: boolean) => (): void => {
    mainWindow?.webContents.send('window:maximized', v)
  }
  mainWindow.on('maximize', sendMaximized(true))
  mainWindow.on('unmaximize', sendMaximized(false))

  // 仍有任務處理中 → 關閉前確認
  mainWindow.on('close', (e) => {
    if (!queue.hasActiveWork() || !mainWindow) return
    const zh = getSettings().language === 'zh'
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: zh ? ['取消', '關閉'] : ['Cancel', 'Quit'],
      defaultId: 0,
      cancelId: 0,
      message: zh ? '仍有任務處理中,確定要關閉嗎?' : 'Jobs are still running. Quit anyway?'
    })
    if (choice === 0) e.preventDefault()
    else queue.cancelAll()
  })

  // 外部連結一律交給系統瀏覽器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.env['AUDIOFORGE_SMOKE'] === '1') {
    // 冒煙測試模式:不開視窗,跑完六功能驗證即退出
    void import('./smoke').then(({ runSmoke }) =>
      runSmoke().catch((err) => {
        console.error('SMOKE_CRASH', err)
        app.exit(1)
      })
    )
    return
  }
  /**
   * 自行實作 Range:Electron 的 net.fetch 對 file:// 不回 206,seek 會失效。
   * 開放式 bytes=N- 必須完整給到檔尾——截斷會讓 Chromium 誤判整檔已緩衝,
   * 表現為播一下就卡、seek 重置。串流轉換交給 Readable.toWeb(背壓與取消由它處理)。
   */
  const MEDIA_MIME: Record<string, string> = {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', webm: 'video/webm',
    mkv: 'video/webm', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
    flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', aac: 'audio/aac'
  }
  const MEDIA_DEBUG = process.env['AUDIOFORGE_MEDIADEBUG'] === '1'

  protocol.handle('media', async (request) => {
    // media://file/<encodeURIComponent(絕對路徑)> → 還原為本地絕對路徑
    const filePath = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
    try {
      const st = await stat(filePath)
      const mime =
        MEDIA_MIME[extname(filePath).slice(1).toLowerCase()] ?? 'application/octet-stream'
      const range = request.headers.get('Range')
      const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null

      const start = m?.[1] ? Number(m[1]) : 0
      const end = m?.[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1
      if (MEDIA_DEBUG) console.log(`MEDIA_REQ range=${range ?? 'none'} → ${start}-${end}/${st.size}`)

      if (start >= st.size || start > end) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } })
      }

      const rs = createReadStream(filePath, { start, end })
      // seek 造成的中止會讓 fs 串流拋錯,吸收掉避免變成未處理例外
      rs.on('error', () => undefined)

      const headers: Record<string, string> = {
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1)
      }
      if (m) headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`

      return new Response(Readable.toWeb(rs) as ReadableStream, {
        status: m ? 206 : 200,
        headers
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })

  const mediaTestFile = process.env['AUDIOFORGE_MEDIATEST']
  if (mediaTestFile) {
    initCache()
    void import('./mediatest').then(({ runMediaTest }) =>
      runMediaTest(mediaTestFile).catch((err) => {
        console.error('MEDIATEST_CRASH', err)
        app.exit(1)
      })
    )
    return
  }

  initCache()
  registerAllTools()
  registerIpc(() => mainWindow)
  createWindow()

  // 主題設為「跟隨系統」時,作業系統深淺色切換也要同步視窗底色
  nativeTheme.on('updated', () => {
    if (getSettings().theme === 'system') mainWindow?.setBackgroundColor(resolveThemeBg('system'))
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
