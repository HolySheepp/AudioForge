/**
 * 無頭媒體診斷(AUDIOFORGE_MEDIATEST=<檔案路徑> 時執行):
 * 用真實的隱藏 BrowserWindow + media:// 協定載入該檔到 <video>,
 * 回報 canplay / error / 實際 networkState / 是否需要 proxy。純診斷,不改任何東西。
 */
import { app, BrowserWindow } from 'electron'
import { ensurePreview, toMediaUrl } from './preview'
import { probeFile } from './ffmpeg/probe'

export async function runMediaTest(file: string): Promise<void> {
  const info = await probeFile(file)
  console.log('PROBE', JSON.stringify({
    hasVideo: info.hasVideo,
    videoCodec: info.videoCodec,
    container: info.container,
    audioStreams: info.audioStreams.length
  }))

  const decision = await ensurePreview(file)
  console.log('PREVIEW_DECISION', JSON.stringify(decision))

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })

  const html = `<!doctype html><html><head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; media-src media: blob:; script-src 'unsafe-inline'">
    </head><body><video id="v"></video><script>
    const v = document.getElementById('v');
    v.src = ${JSON.stringify(decision.url)};
    const report = (tag, extra) => console.log('VIDEO_' + tag, JSON.stringify(extra || {}));
    v.addEventListener('loadedmetadata', () => report('LOADEDMETA', { duration: v.duration, w: v.videoWidth, h: v.videoHeight }));
    v.addEventListener('canplay', () => report('CANPLAY', { duration: v.duration }));
    v.addEventListener('error', () => report('ERROR', {
      code: v.error && v.error.code, message: v.error && v.error.message,
      networkState: v.networkState, readyState: v.readyState
    }));
    setTimeout(() => report('TIMEOUT', { networkState: v.networkState, readyState: v.readyState, videoWidth: v.videoWidth }), 5000);
    </script></body></html>`

  win.webContents.on('console-message', (_e, _lvl, message) => {
    if (message.startsWith('VIDEO_') || message.startsWith('PROBE') || message.startsWith('PREVIEW')) {
      console.log(message)
    }
    if (message.startsWith('VIDEO_CANPLAY') || message.startsWith('VIDEO_ERROR') || message.startsWith('VIDEO_TIMEOUT')) {
      setTimeout(() => app.exit(0), 300)
    }
  })

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}
