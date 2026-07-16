import { app, BrowserWindow, protocol, net, shell, dialog } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'AudioForge',
    autoHideMenuBar: true,
    backgroundColor: '#16181d',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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
  protocol.handle('media', (request) => {
    // media:///C%3A/Users/... → 還原為本地絕對路徑
    const raw = decodeURIComponent(new URL(request.url).pathname)
    const filePath = raw.startsWith('/') ? raw.slice(1) : raw
    return net.fetch(pathToFileURL(filePath).toString())
  })

  initCache()
  registerAllTools()
  registerIpc(() => mainWindow)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
