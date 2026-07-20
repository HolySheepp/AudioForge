import { app, BrowserWindow, protocol, shell, dialog, nativeTheme } from 'electron'
import { join, extname } from 'path'
import { open, stat } from 'fs/promises'
import { registerIpc } from './ipc'
import { initCache } from './cache'
import { registerAllTools } from './tools'
import { queue } from './queue'
import { getSettings } from './settings'

// media:// 自訂協定:讓 renderer 的 <video>/<audio> 能安全地串流本地媒體檔
// URL 形式:media:///C:/path/to/file.mp4(路徑經 encodeURIComponent 逐段編碼)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: false, stream: true, bypassCSP: true, supportFetchAPI: true }
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
  // 自行處理 Range 請求:<video>/<audio> 的進度條拖動(seek)必須靠 206 部分回應
  const MEDIA_MIME: Record<string, string> = {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', webm: 'video/webm',
    m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
    ogg: 'audio/ogg', opus: 'audio/ogg', aac: 'audio/aac'
  }
  // 開放式 Range(bytes=N-)一律截成固定區塊,直接讀該區段進 Buffer 回傳。
  // 不用串流:Chromium 播影片會頻繁 seek 並中止上一個請求,串流會因中途中止而拋錯
  // (Chromium 端顯示為 PIPELINE_ERROR_READ),改為有界的 Buffer 回應即可完全避免。
  const RANGE_CHUNK = 2 * 1024 * 1024
  protocol.handle('media', async (request) => {
    // media:///C%3A/Users/... → 還原為本地絕對路徑
    const raw = decodeURIComponent(new URL(request.url).pathname)
    const filePath = raw.startsWith('/') ? raw.slice(1) : raw
    let fh: Awaited<ReturnType<typeof open>> | null = null
    try {
      const st = await stat(filePath)
      const mime =
        MEDIA_MIME[extname(filePath).slice(1).toLowerCase()] ?? 'application/octet-stream'
      const range = request.headers.get('Range')
      const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null

      const start = m?.[1] ? Number(m[1]) : 0
      const explicitEnd = m?.[2] ? Number(m[2]) : null
      const end =
        explicitEnd != null
          ? Math.min(explicitEnd, st.size - 1)
          : Math.min(start + RANGE_CHUNK - 1, st.size - 1)
      const length = Math.max(0, end - start + 1)

      fh = await open(filePath, 'r')
      const buf = Buffer.allocUnsafe(length)
      if (length > 0) await fh.read(buf, 0, length, start)
      await fh.close()
      fh = null

      // 有 Range 或被截斷 → 206;整檔一次要完 → 200
      const partial = range != null || length < st.size
      return new Response(buf, {
        status: partial ? 206 : 200,
        headers: {
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(length),
          ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${st.size}` } : {})
        }
      })
    } catch {
      await fh?.close().catch(() => undefined)
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
