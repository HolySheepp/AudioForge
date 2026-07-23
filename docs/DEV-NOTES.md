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

## 響度分析指標(可設定)

分析指標定義在 `shared/types.ts` 的 `ANALYSIS_METRICS`(id / unit / derived / needsAstats)。
`metricValue(analysis, id)` 統一取值。設定裡「響度分析」頁選要算哪些:

- `lufs` / `lra` / `truePeak`:ebur128 單次讀取全給,不分開算,無額外成本。
- `plr`(= truePeak − integrated):衍生,免費。
- `crest`(Peak − RMS):需 **額外一次 astats**,故預設關;開了才會多讀一次檔。

`analysisMetrics`(要算哪些)與 `pinnedMetrics`(釘到來源列哪些,預設 lufs/lra/truePeak)
都存 settings。多軌 astats 的 crest 靠 `Parsed_astats_<n>` log 標記對應軌序(見
`common.ts` 的 `parseAstatsCrest`)。

**runner 依勾選跳過 pass**:`analysis.ts` 只在有勾 ebur 類指標(lufs/lra/truePeak/plr)
時才跑 ebur128,只在勾 crest 時才跑 astats。因此 `TrackAnalysis` 的數值欄位全為可選
(沒算的就不存在),`metricValue` 對缺值回 undefined,UI 顯示「—」。這讓設定裡的
**負擔條**誠實——取消勾選是真的省一遍讀取,不是假的。

負擔條(比例正確,以「讀取次數」計):每個指標標了 `pass`('ebur' / 'astats')。
lufs/lra/truePeak/plr 同屬 ebur 一次讀取,crest 是 astats 另一次。條長 =
啟用的 pass 數 / `ANALYSIS_PASSES.length`(= 2)。**同一 pass 佔固定一份(50%),
由該 pass 內勾選的指標平分顯示**——勾越多不會讓總量變長,只會把那 50% 細分,
因為它們共用同一次讀取。顏色固定不設圖例。

⚠️ 別回到「每指標各記固定 load 相加」的舊模型——那會讓「只勾 LUFS」顯示 ~17%,
但實際上已花掉整個 ebur 讀取(該 50%),比例不誠實。

## 混音(卡片制:湯底 + 材料)

v0.9.0 起混音重新設計成「混音卡」佇列(`store/index.ts` 的 `MixCard`),取代原本
「勾選一批音訊檔全部混成一軌」的模式:

- **湯底(base)**:一個檔案的一條音軌,決定輸出型態。屬於影片 → 輸出整部影片
  (畫面/其餘音軌 copy,只有湯底那條被取代);屬於純音訊檔 → 輸出新音訊檔。
- **材料(ingredients)**:混進湯底的其他音軌,可來自任何已勾選的檔案(含影片的某軌)。
- 卡片恆有一張尾端空卡待填;湯底一指派,自動長出下一張空卡。一軌同時只能是
  一張卡的湯底(指派給新卡會從原卡搶走),但可以是多張卡的材料。
- 互動(v0.9.1 起改為「兩個可點區塊」):每張卡有主音軌格與混入格,點格子 = 選定
  `activeMixSlot`(哪張卡的哪一格),再點上方音軌列把音軌填進那格。不用點卡片本身。
  填入空的主音軌格後,`activeMixSlot` 自動移到同卡的混入格(順著自然流程)。
  取消指派(移除檔案/取消勾選)靠 `pruneMixCardRefs` + `normalizeMixCards` 清乾淨;
  `keepMixSlot` 保證作用中的格子所屬卡片還在,否則退回尾端空卡的主音軌格。
- **對使用者的用詞**:base/ingredient 只是內部命名,UI 顯示「主音軌 / 混入」(Main /
  Mix in),不要讓使用者看到湯底/材料。
- Start 時每張完整卡(湯底+至少一個材料)各自是一個獨立 job,`StatusBar` 用
  `startJobs([spec], groupIds)` 逐卡呼叫,`groupIds` = 該卡涉及的所有來源列
  id,讓進度/狀態同步顯示在每一列上。

**踩過的坑**:同一份檔案的兩條不同軌,若分別是不同混音卡的湯底,兩個 job 會平行
跑。`resolveOutputPath` 只在呼叫當下用 `existsSync` 查重,兩個 job 都還沒寫檔前
查都是「不存在」,會算出同一個候選檔名——真實的競爭條件,不是假設性的。修法是
輸出檔名帶軌號(`_mixed_trackN`,跟 `extract.ts` 對多軌的處理一致),從源頭讓
兩個 job 的候選檔名一開始就不同,不依賴時機。冒煙測試用 `Promise.all` 平行跑兩個
同檔案不同軌的混音 job,驗證輸出檔名確實不同。

**另一個踩過的坑(測試工具本身)**:`queue.setOnUpdate` 是單一全域 callback,
`smoke.ts` 原本的 `runJob` 每次呼叫都重新 `setOnUpdate`——用 `Promise.all` 平行
跑兩個 `runJob` 時,後呼叫的會覆蓋前一個的 handler,先完成的 job 沒人接住,
`resolve` 永遠不觸發,整個冒煙測試卡死。改成只在模組載入時裝一次共用 dispatcher,
用 `Map<jobId, resolve>` 分派。

## 多軌與批次互斥(tool-aware)

`store/index.ts` 的 `exclusive()` 只對 `SHARED_TRACK_TOOLS`(normalize/convert/
extract/replace,面板綁單一檔案的軌配置)生效;analysis(逐檔卡片)與 mixdown
(跨檔)不受限,可同時處理多個多軌檔。`setTool` 切到 shared-track 功能時會再收斂一次。

## 多軌純音訊

`normalize` 的路由用 `hasVideo || audioStreams.length > 1` 判斷走逐軌,不是只看
hasVideo——否則雙軌 mka 之類會被丟進單軌路徑只處理第一軌。`useTrackCtx` 的
`perTrack` 同理(影片一律逐軌,純音訊只有多軌才逐軌)。

## normalize 單軌值統一到 tracks[0]

單軌 UI 與逐軌 UI 都寫 `tracks[0]`(不再另存頂層 `lufs`/`tp`)。runner 的 singleTrack
從 `tracks[0]` 取值,`lufs`/`tp` 僅作 tracks 不存在時的 fallback。這樣混批(影片+
音訊)時音訊檔用的是使用者在卡片上看得到的值,不會吃到隱藏的舊單軌值。

## 設定落盤去抖動

`main/settings.ts` 的 `updateSettings` 記憶體即時更新、寫盤延後 400ms 合併,
`will-quit` 強制沖掉。因為旋鈕拖曳每跨一齒就 updateSettings 一次,同步寫盤太頻繁。
`load()` 另做一次性清理,丟掉舊版孤兒鍵(`toolParams.multitrack`、`knobSteps["mt.*"]`)。

## app 內調色盤(不用原生 input）

`components/ColorPicker.tsx`:自製 HSV 色板 + 色相條 + hex,可拖曳,Save/Cancel。
不用 `<input type=color>`——那是 OS 視窗,無法改樣式/移位/加按鈕,做不到主題連動與即時預覽。
開盤時 `SettingsModal` 只渲染 ColorPicker(收起設定與變暗遮罩),讓使用者以原亮度預覽主界面。
**坑**:`onPreview` 每次 render 是新函式,若放進 effect deps 會 saveSettings→重繪→再 preview
無限迴圈——用 ref 穩定,effect 只依 hex,且跳過掛載那次(開盤瞬間不該改當前色)。
起始色從 `getComputedStyle('--accent')` 取當前實際生效色(內建色也解析成 hex)。
預覽只呼叫 `applyAccent`(改 CSS 變數,不落盤);Cancel 用 applyAccent 還原、Save 才
`saveSettings`。

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
