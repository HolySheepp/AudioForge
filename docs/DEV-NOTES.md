# 開發筆記(給接手的 Claude Code 看)

這份文件把散落在本機 `~/.claude/.../memory/` 裡、跟 AudioForge 有關的知識收攏進 repo,
確保單靠 `git clone` 就能拿到完整脈絡,不依賴任何一台機器的記憶系統。

原始規格文件見 [PROMPT.md](./PROMPT.md)。

## 開發指令

```bash
npm install
npm run setup:ffmpeg   # 下載 FFmpeg 到 bin/(clone 後第一次需要)
npm run dev            # 開發模式
npm run build           # electron-vite build
npx tsc --noEmit         # 型別檢查
```

## 冒煙測試(每次重大改動後跑一次)

```bash
npm run smoke
# 或手動:AUDIOFORGE_SMOKE=1 npx electron .
```

自動產生測試媒體,實跑六大功能(analysis/normalize/extract/convert/replace/multitrack/mixdown),
用 ffprobe/ebur128 驗證輸出。目前 25 項全過。

另有無頭媒體診斷工具(`src/main/mediatest.ts`),用於排查 `<video>`/`<audio>` 播放問題:

```bash
AUDIOFORGE_MEDIATEST="C:\path\to\file.mp4" npx electron .
AUDIOFORGE_MEDIATEST_RAW=1 AUDIOFORGE_MEDIATEST="..." npx electron .  # 對照組:繞過 media:// 協定
AUDIOFORGE_MEDIADEBUG=1 AUDIOFORGE_MEDIATEST="..." npx electron .     # 印出協定層每個 Range 請求
```

## 打包

```bash
npx electron-builder   # 產出 release/ 下的 Setup.exe / portable.exe / win.zip
```

**已知坑**:`release/win-unpacked` 常被正在執行的 AudioForge.exe 鎖住導致打包失敗(EBUSY)。
遇到就直接關閉所有 AudioForge 程序再重跑,不用擔心是不是使用者正在用:

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*AudioForge*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

**版本流程**:改 `package.json` 的 `version` → commit → `git tag vX.Y.Z` → push → 打包 →
**確認新產物存在後**才刪除 `release/` 裡的舊版本(避免打包失敗時 release/ 一度清空)。

## 技術決策備忘(偏離最初 PROMPT.md 的地方)

- React 19(非 PROMPT 寫的 18)
- 設定持久化用手寫 JSON,非 electron-store(v9+ 純 ESM,打包相容性考量)
- 無 Tailwind,手寫 CSS + CSS variables
- `media://` 協定必須註冊為 `standard: true`(見下方「媒體協定」一節,這是踩過的大坑)

## 媒體協定(`media://`)—— 踩過的坑,別重踩

`src/main/index.ts` 裡的 `protocol.handle('media', ...)`。曾經因為兩個原因讓影片預覽完全播不動:

1. **scheme 必須註冊 `standard: true`**。一開始註冊成 `standard: false`,結果 Chromium
   的媒體管線拿不到完整的 byte-range 支援——同一支 29.4 秒的影片會被誤判成 10.4 秒,
   播一下就卡、拖曳進度條直接失效。改成 `standard: true`(連帶 `secure/corsEnabled`)
   後才正常。標準 scheme 的 URL 格式要求也不同,所以路徑編碼改成
   `media://file/<encodeURIComponent(絕對路徑)>`(不能再用 `media:///C:/...` 那種寫法,
   會被 Chromium 的 URL 安全檢查擋下)。
2. **Range 請求要用串流(`Readable.toWeb`),不能截斷或整包塞進記憶體**。開放式
   `bytes=N-` 一定要串到檔尾,截斷會讓 Chromium 誤判整檔已緩衝。

診斷這類問題時,**不要用讀 log 猜的方式**——直接用 `mediatest.ts` 那套無頭診斷模式跑
`AUDIOFORGE_MEDIATEST=<檔案>`,拿到真實的 `VIDEO_ERROR`/`VIDEO_LOADEDMETA` 事件,
必要時開 `AUDIOFORGE_MEDIATEST_RAW=1` 做對照組(繞過 `media://` 直接用 `file://`),
兩相比較 duration 是否一致,能最快定位問題出在協定層還是別處。

## UI 文案原則

主文案講完就停,不要在下面加「補充說明/原理解釋/保證」性質的第二句
(例如「只記錄路徑,不會複製或修改你的檔案」這種)。這類句子是 AI 生成文案的
典型特徵,人類設計師通常信任 UI 本身的直覺。
