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

自動產生測試媒體,實跑六大功能(analysis/normalize/extract/convert/replace/mixdown),
含逐軌路徑,用 ffprobe/ebur128 驗證輸出。目前 33 項全過。

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

## 逐軌處理(取代原本的 multitrack 功能)

原本「多軌工作流」是側欄上的獨立功能。v0.6.0 起改成**每個功能自己處理多音軌**,
獨立的 multitrack 功能已移除,其引擎併進 `normalize`。

規則:

- **影片檔**一律展開逐軌介面(即使只有一軌);**純音訊檔**用單軌的簡潔介面。
  音訊檔的「軌」對使用者沒有意義,多包一層外框只是雜訊。
- 參數物件同時帶「單軌欄位」與「逐軌陣列」,由 main 的 runner 依實際 probe 結果挑用
  (`src/main/tools/tracks.ts` 的 `resolveTracks` / `resolveTrackCfgs`)。
  批次裡混到音訊檔也不會套錯路徑。
- 逐軌設定以**軌序**為 key 記憶,長度可超過當前檔案軌數——換檔案再換回來設定還在。
- **多軌與批次互斥**:勾選集合裡最多一個多軌檔,且它入選就獨佔(`store/index.ts` 的
  `exclusive()`)。使用者親手勾的多軌檔優先獨佔;全選/拖入/probe 完成這類非針對性的
  變動則讓批次贏。軌數要 probe 完才知道,所以 probe 的 `.then` 也要再收斂一次。

`replace` 的 `targetTrack`:`-1` 換掉全部音軌,`>= 0` 只換該軌、其餘原位 copy。
多軌時 `-filter:a:N` / `-c:a:N` 的 N 是**輸出**音訊流序號,因為映射保持原軌序,
所以 N 等於軌序。

## 混音真峰值限制器(踩過的坑)

混音後的保險限制器**必須用真峰值(true peak),不能只用 `alimiter`**。
`alimiter` 只限制取樣點峰值(sample peak),但各軌相加後的 inter-sample peak
對真實寬頻內容可高出數 dB——實測混音後 true peak 會衝到 +1 ~ +3,即使 alimiter
設在 -1。BS.1770 的 true peak 就是 4× 超取樣後的峰值。

作法(`common.ts` 的 `truePeakLimiter`):升到 4×(48k→192k)→ `alimiter`
→ 降回原取樣率。降採樣會回吐約 0.2–0.5dB,故內部門檻再壓低 0.5dB 當餘裕,
輸出穩定落在天花板下方約 0.3dB。

**測試陷阱**:驗證這條限制器**不能用正弦波**——正弦頻帶受限、幾乎沒有
inter-sample peak,拿掉超取樣它照樣過。冒煙測試的影片音軌因此改用寬頻內容
(粉紅噪 + 鋸齒),且混音測試把兩軌都推到 -9 LUFS 逼混音過載,未修版本會在此
FAIL(true peak -0.4)、修好後 -1.3。

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
