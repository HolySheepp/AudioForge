/**
 * 無頭媒體診斷(AUDIOFORGE_MEDIATEST=<檔案路徑> 時執行):
 * 用真實的隱藏 BrowserWindow + media:// 協定載入該檔到 <video>,
 * 回報 canplay / error / 實際 networkState / 是否需要 proxy。純診斷,不改任何東西。
 */
import { app, BrowserWindow } from 'electron'
import { pathToFileURL } from 'url'
import { ensurePreview } from './preview'
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

  // AUDIOFORGE_MEDIATEST_RAW=1 → 用 file:// 直接載入,繞過 media:// 協定(對照組)
  const useRaw = process.env['AUDIOFORGE_MEDIATEST_RAW'] === '1'
  const srcUrl = useRaw ? pathToFileURL(file).toString() : decision.url
  console.log('TEST_SRC', useRaw ? 'file://(raw)' : 'media://')

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: false, webSecurity: !useRaw }
  })

  const html = `<!doctype html><html><head></head><body><video id="v"></video><script>
    const v = document.getElementById('v');
    v.src = ${JSON.stringify(srcUrl)};
    const report = (tag, extra) => console.log('VIDEO_' + tag, JSON.stringify(extra || {}));
    v.addEventListener('loadedmetadata', () => report('LOADEDMETA', { duration: v.duration, w: v.videoWidth, h: v.videoHeight }));
    v.addEventListener('canplay', () => { report('CANPLAY', { duration: v.duration }); v.play().catch(e => report('PLAYFAIL', { e: String(e) })); });
    v.addEventListener('stalled', () => report('STALLED', { readyState: v.readyState, ct: v.currentTime }));
    v.addEventListener('waiting', () => report('WAITING', { readyState: v.readyState, ct: v.currentTime }));
    v.addEventListener('error', () => report('ERROR', {
      code: v.error && v.error.code, message: v.error && v.error.message,
      networkState: v.networkState, readyState: v.readyState
    }));
    // 播放 3 秒後回報實際前進到哪、緩衝了多少 → 分辨「能載入但卡住」
    setTimeout(() => {
      let buffered = [];
      for (let i = 0; i < v.buffered.length; i++) buffered.push([v.buffered.start(i), v.buffered.end(i)]);
      report('PROGRESS3S', { ct: v.currentTime, paused: v.paused, readyState: v.readyState, networkState: v.networkState, buffered: buffered });
      // 再測 seek 是否有效
      v.currentTime = Math.min(5, v.duration * 0.5);
      setTimeout(() => report('AFTERSEEK', { ct: v.currentTime, readyState: v.readyState }), 1500);
    }, 3000);
    </script></body></html>`

  win.webContents.on('console-message', (_e, _lvl, message) => {
    if (message.startsWith('VIDEO_') || message.startsWith('PROBE') || message.startsWith('PREVIEW')) {
      console.log(message)
    }
    if (message.startsWith('VIDEO_AFTERSEEK') || message.startsWith('VIDEO_ERROR')) {
      setTimeout(() => app.exit(0), 300)
    }
  })

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}
