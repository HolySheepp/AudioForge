# 任務提示詞:打造「AudioForge」— 簡化版 Shutter Encoder(音訊工作站)

> **使用方式**:將本文件全文作為任務提示詞交給 Claude Code(Fable 5)。所有關鍵決策已預先定案,執行過程中**不應再向用戶提問**,除非遇到「§9 已預先決策清單」未涵蓋、且沒有任何合理預設可推斷的情況。
> 專案根目錄:`C:\Users\francishuang\Desktop\Try\AudioForge\`

---

## 0. 角色與心智模型

你是資深桌面應用工程師,精通 Electron、React、TypeScript 與 FFmpeg 命令列。你要從零打造、並打包成 Windows 安裝包的一個完整桌面應用。品質基準:用戶雙擊安裝包 → 下一步 → 開啟 app → 拖入檔案 → 按開始,全程不需要安裝任何其他東西。

**效率原則**(本專案的靈魂):所有媒體處理都交給 FFmpeg,能 stream copy 就絕不重新編碼,能平行就平行。UI 永遠不阻塞——所有 FFmpeg 工作都在 main process 以子程序執行。

---

## 1. 產品定義

一個精簡版 Shutter Encoder:專注音訊工作流的批次處理工具,六大功能:

1. **Loudness / True Peak 分析** — 測量檔案的 Integrated Loudness(LUFS)、Loudness Range(LU)、True Peak(dBTP)
2. **Audio Normalization** — 兩段式 loudnorm 響度正規化
3. **Audio Replacement** — 替換影片中的音軌,可 A/B 對照試聽
4. **Extract** — 從影片抽出音軌(預設無損 stream copy)
5. **Audio Conversion** — WAV / MP3 / AAC / FLAC 互轉
6. **多軌工作流(Multi-track)** — 對多音軌錄影檔的各音軌**直接**分別設定標準化,一次混音成立體聲寫回影片(畫面流 copy),取代 extract→normalize→mix→replace 四步鏈(見 §3.6,本軟體的招牌功能)

輸入接受音訊檔與影片檔(**只記路徑,零拷貝**——與 Shutter Encoder 相同,拖入時僅把絕對路徑交給後端,前端顯示清單,檔案本體從不匯入或複製);**雙欄工作區**(左:來源檔案含勾選框,右:已處理檔案可一鍵移回來源再處理);平行批次處理;深/淺色主題;**繁體中文 / English 雙語 UI**;內建預覽播放器與波形圖;啟動時**偵測硬體**(NVENC 等)自動啟用加速。

---

## 2. 技術棧(已定案,不再討論)

| 項目 | 決定 |
|---|---|
| 框架 | Electron(最新穩定版)+ React 19 + TypeScript,以 **electron-vite** 建立 |
| 狀態管理 | zustand |
| 樣式 | 手寫 CSS + CSS variables 主題 token(深/淺兩套);UI 幾乎全是自製元件,不引入 CSS 框架 |
| 打包 | electron-builder → **NSIS 安裝包**(x64,Windows 10/11) |
| FFmpeg | 內建 gyan.dev **release-essentials** 版的 `ffmpeg.exe` + `ffprobe.exe`,放專案 `bin/`,打包時以 `extraResources` 帶入;寫一個 dev/prod 兩用的路徑解析 helper(dev 用 `bin/`,prod 用 `process.resourcesPath`) |
| 程序模型 | 所有 FFmpeg 以 `child_process.spawn` 在 main process 執行,`-progress pipe:1 -nostats` 解析進度,經 IPC 推送 renderer;renderer 絕不直接碰檔案系統 |
| 本地媒體存取 | 在 main 註冊自訂協定 `media://`(串流本地檔給 `<video>`/`<audio>`),避免 file:// 安全性問題 |
| 設定持久化 | 手寫 JSON 檔(userData/settings.json)——electron-store v9+ 為純 ESM,為避免 CJS 打包相容問題改為自寫 30 行等價實作 |
| i18n | 自製輕量 dictionary(zh-TW / en 兩份 JSON + React context hook),約百餘 key,不引入 i18next |
| 拖放取路徑 | renderer 以 `webUtils.getPathForFile(file)` 取得絕對路徑(新版 Electron 已移除 `File.path`),只把路徑傳給 main;檔案本體永不複製或匯入 |

**授權註記**:gyan.dev 的 build 為 GPL。個人使用無虞;若日後公開散布,需附 FFmpeg 授權聲明與原始碼取得方式。在 README 註明即可,不影響開發。

---

## 3. 六大功能規格

通用規則(適用所有功能):
- 任務開始前先以 `ffprobe -v error -show_format -show_streams -of json` 取得 metadata(時長、軌道、codec、取樣率),入佇列時即顯示。
- 進度 = `out_time_ms / duration`。兩段式任務中 pass1 佔 0–50%、pass2 佔 50–100%。
- 輸出檔:預設寫到與來源相同資料夾,加功能後綴;絕不覆寫來源檔;衝突時自動加 ` (1)`、` (2)`。
- 保留 metadata:輸出加 `-map_metadata 0`。

### 3.1 Loudness / True Peak 分析
- 指令:`ffmpeg -hide_banner -nostats -i IN -map 0:a:0 -af ebur128=peak=true -f null NUL`,解析 stderr 摘要區塊的 `I:`、`LRA:`、`True peak / Peak:`。
- UI:結果以表格顯示在佇列列上(LUFS / LU / dBTP 三欄),超過 -1 dBTP 的 true peak 以警示色標示;結果可一鍵複製整表(TSV)。
- 此功能不產生輸出檔。波形圖上疊加 true peak 標記線(見 §5)。

### 3.2 Audio Normalization(兩段式 loudnorm)
- Pass 1(測量):`ffmpeg -i IN -map 0:a:0 -af loudnorm=I={I}:TP={TP}:LRA=11:print_format=json -f null NUL`,從 stderr 解析 JSON 的 `input_i / input_tp / input_lra / input_thresh / target_offset`。
- Pass 2(套用):`loudnorm=I={I}:TP={TP}:LRA=11:measured_I=..:measured_TP=..:measured_LRA=..:measured_thresh=..:offset=..:linear=true`。
- **重要**:loudnorm 內部會升到 192 kHz,pass 2 必須加 `-ar {來源取樣率}` 還原。
- 參數面板:預設按鈕「**-14 LUFS / -1 dBTP(串流平台)**」+ 自訂欄位(Target LUFS、Target TP;LRA 固定 11 不開放)。
- 輸入是音訊檔 → 輸出同格式同規格(位元率比照來源或同級);輸入是影片 → `-map 0 -c:v copy -c:s copy`,只重編音訊(AAC 320k,或來源是 PCM 時維持 PCM)。
- 後綴 `_normalized`。

### 3.3 Audio Replacement
- 佇列列為「影片 + 新音訊」配對:先拖影片,該列出現「選擇新音軌」按鈕(或直接把音訊檔拖到該列上)。
- 指令原型:`ffmpeg -i VIDEO -i AUDIO -map 0 -map -0:a -map 1:a:0 -c copy -c:a:0 {codec}`(保留字幕/章節,只換音軌)。
- 長度選項:
  - **保留完整影片(預設)**:`-af apad -shortest`(音訊不足補靜音)——此模式必然重編音訊。
  - **以較短者為準**:`-shortest`,音訊 codec 可選 copy。
- 音訊編碼選項:AAC 320k(預設)/ PCM(mov、mkv 容器時)/ copy(僅「較短者為準」+ 容器相容時;不相容就自動降級 AAC 320k 並在任務日誌註明)。
- 預覽支援 **A/B 切換**:影片畫面 + 即時切換原音軌/新音軌試聽(實作:`<video>` 靜音播畫面,兩個音訊源同步 currentTime)。
- 後綴 `_replaced`。

### 3.4 Extract(抽取音軌)
- 預設「**原格式無損**」:probe 音訊 codec 後 stream copy 到對應容器——`aac→.m4a`、`mp3→.mp3`、`pcm_*→.wav`、`flac→.flac`、`opus/vorbis→.ogg`、其他(ac3/dts/eac3 等)→`.mka`。
- 另可選轉檔輸出:WAV(pcm_s24le)/ MP3 320k / FLAC。
- 多音軌:預設第 1 軌;參數面板列出所有音軌(語言、codec、聲道)供勾選,可全選;多軌輸出檔名加 `_track1`、`_track2`。
- 後綴 `_extracted`(多軌時後綴在 track 標記之前)。

### 3.5 Audio Conversion
- 輸入:音訊檔或影片檔(影片 = 取其音軌轉檔)。
- 輸出格式與參數:
  - **WAV**:位元深度 16/24/32-float;取樣率 保持原始(預設)/44.1k/48k/96k
  - **MP3**:CBR 128/192/256/320k(預設 320)或 VBR V0/V2
  - **AAC(.m4a)**:128/192/256/320k(預設 256)
  - **FLAC**:壓縮等級 5,位元深度跟隨來源
  - 聲道:保持原始(預設)/立體聲/單聲道
- 後綴 `_converted`。

### 3.6 多軌工作流(Multi-track Normalize & Mix)——招牌功能

**用途**:錄影檔(如 OBS 錄製)常含一條視訊軌 + 多條音軌(例:遊戲音軌、麥克風音軌),各軌需要不同的標準化目標(例:遊戲 -20 LUFS、麥克風 -14 LUFS)。傳統流程要 extract→各自 normalize→mix→replace 四步、產生一堆中間檔;本功能**直接對檔內各音軌操作,一步完成**。

**UI**:選擇左欄檔案後,參數面板列出該檔全部音軌(ffprobe:軌號、codec、聲道、語言 tag)。每軌一列:
- 處理方式下拉:「標準化 / 保持原樣 / 排除」
- 選「標準化」時出現 Target LUFS 與 True Peak 旋鈕;**每軌獨立記憶上次參數**(軌 1 記住 -20、軌 2 記住 -14,下次打開就緒)
- 輸出模式:「**混音為單一立體聲軌**(預設)」/「保留多軌(各軌原位處理)」
- 混音模式下提供「混音後保險限制器」開關(預設開)+ 全域 TP 上限旋鈕(預設 -1 dBTP):混音後套 `alimiter`,僅在兩軌相加峰值超標時介入,防止削波

**執行**(整個流程:檔案讀 2 次、寫 1 次,畫面流不重編):
- Pass 1 — 單次讀取同時測量所有需標準化的軌:
  `-filter_complex "[0:a:0]loudnorm=I=-20:TP=-1:LRA=11:print_format=json[m0];[0:a:1]loudnorm=I=-14:TP=-1:LRA=11:print_format=json[m1]" -map [m0] -f null NUL -map [m1] -f null NUL`
  自 stderr 依序解析各 loudnorm 實例的 JSON 區塊(依 filtergraph 宣告順序對應)。
- Pass 2 — 套用 + 混音 + 寫回:
  `-filter_complex "[0:a:0]loudnorm=...measured...:linear=true[a0];[0:a:1]loudnorm=...measured...:linear=true[a1];[a0][a1]amix=inputs=2:normalize=0[mix]" -map 0:v -map "[mix]" -c:v copy -c:s copy -c:a aac -b:a 320k -ar {來源取樣率} -map_metadata 0`
  - `amix normalize=0` 是關鍵:**不自動衰減**,完整保留各軌校準後的響度關係;「排除」的軌不進 filtergraph。
  - 「保留多軌」模式:各軌各自 loudnorm 後 `-map [a0] -map [a1]` 原位輸出,不 amix。
- 「保持原樣」的軌:混音模式下直接進 amix(不套 loudnorm);保留多軌模式下 stream copy。

**批次**:同一設定套用到所有勾選檔案,依**音軌序號**對應(錄影檔軌道佈局一致的前提);某檔軌數不足 → 該檔標失敗並註明原因,不影響其他檔。

**後綴**:`_mixed`(混音模式)/ `_mtnorm`(保留多軌模式)。

**註**:Extract 功能仍保留(單獨取出某軌仍有用),但本功能讓「錄影後製標準化」不再需要它。

---

## 4. 工作區、佇列與效能

### 4.1 雙欄工作區(核心工作流)
- **左欄「來源檔案」**:用戶拖入的檔案(或資料夾→遞迴掃描支援副檔名)。每列:勾選框(預設勾選)、檔名、時長、格式、狀態、進度條、單項移除。頂部工具列:**全選 / 全不選**、**清除全部**(一鍵清空清單;只清路徑清單,絕不動實體檔案)。
- **右欄「已處理」**:任務完成的輸出檔自動出現在此。每列操作:**⬅ 移至來源**(把該輸出檔加入左欄、自右欄移除,即可對它做下一輪處理,不必重新拖放)、**開啟所在資料夾**。頂部工具列:全部移至來源、清空清單(右欄清單僅存在於本次執行,不持久化)。
- 「開始處理」只處理左欄**已勾選**的檔案,套用當前選擇的功能與參數;進度顯示在該列上。
- 檔案在 app 內自始至終只以**絕對路徑**存在(與 Shutter Encoder 相同);拖入當下即以 ffprobe 補齊 metadata 顯示。左右欄任一列點擊皆載入預覽面板。

### 4.2 佇列與平行
- 平行執行 1–6 個 FFmpeg 子程序(預設 3,狀態列可調);佇列管理器在 main process 調度。
- 狀態:等待/處理中/完成/失敗/已取消;可取消單項或全部;處理中關閉視窗要跳確認。
- 失敗任務可點開查看 stderr 最後 30 行,不影響其他任務。
- 波形 peaks 與 proxy 有快取(見 §9),同一檔案切換功能不重算。

### 4.3 效率原則與硬體加速
- **能 stream copy 絕不重編**:extract 預設無損抽取、replacement 與 normalization 的視訊流一律 `-c:v copy`——這些操作速度趨近磁碟 IO,零畫質損失。
- **必須重編音訊時**:音訊編碼是 CPU 工作、單檔多為單執行緒 → 靠**平行佇列吃滿多核**(R7 9800X3D 同時跑多個任務,總吞吐倍增),而非單檔加速。
- **GPU 偵測與使用**:啟動時執行 `ffmpeg -encoders` 列出候選(h264_nvenc / hevc_nvenc / h264_qsv / h264_amf),再以 1 幀真實試編驗證可用性(`-f lavfi -i color=black:s=256x256:d=0.1 -c:v h264_nvenc -f null -`——列出 ≠ 驅動可用);GPU 型號經 `Get-CimInstance Win32_VideoController` 取得,顯示於設定頁與狀態列指示。可用時,**所有視訊重編碼路徑改用 NVENC**——本 app 中即 proxy 預覽產生(RTX 5070 Ti 上大檔預覽幾乎即時)。設定頁提供「硬體加速:自動(預設)/停用」。
- **誠實註記**(寫給實作時的自己):本 app 核心負載(loudnorm 兩段式、音訊編碼)本質是 CPU 任務,GPU 效益集中在 proxy 產生與未來可能的視訊功能;整體高效的真正來源是 stream copy + 平行佇列 + 零拷貝路徑引用。不要為了「用上 GPU」而把音訊管線複雜化。

---

## 5. UI / UX 規格

版面(單一主視窗,約 1200×800 起,可縮放):

```
┌───────────────────────────────────────────────────┐
│ Header:AudioForge｜語言(繁/EN)｜主題(淺/深/系統)｜設定│
├──────┬──────────────────────┬─────────────────────┤
│ 側欄  │ 來源檔案(勾選框)       │ 已處理檔案            │
│ 六功能│ [全選][全不選][清除全部]│ [⬅全部移至來源][清空]  │
│ 切換  │ (拖放目標區)           │ 每列:⬅移至來源/開資料夾│
├──────┴──────────────────────┴─────────────────────┤
│ 當前功能的參數面板                                    │
├───────────────────────────────────────────────────┤
│ 預覽面板(可收合):播放器 + 波形 + 傳輸控制              │
├───────────────────────────────────────────────────┤
│ 狀態列:勾選統計｜平行數｜硬體加速指示｜[開始處理] 主按鈕 │
└───────────────────────────────────────────────────┘
```

### 主題
- CSS variables 兩套 token(`--bg / --surface / --text / --text-dim / --accent / --border / --danger / --success` 等),深/淺完整覆蓋,無「漏刷」元素。
- 預設跟隨系統(`nativeTheme`),可手動固定淺或深,選擇持久化。切換要有 150ms 過渡。

### 語言
- 繁體中文(預設)/ English,Header 一鍵切換、即時生效、持久化。所有 UI 字串走 dictionary,不允許 hardcode。

### 參數控制:旋鈕(Knob)元件——投入打磨,這是 UI 的靈魂
所有數值型參數(LUFS、TP、位元率等)一律用自製旋鈕元件(canvas 或 SVG),互動規格:
- **拖曳旋轉(棘輪模式,預設)**:按住後垂直拖動;旋轉角度**吸附到齒格**(detent),每格 = 一個步進值,過格時有微小的視覺回彈/頓挫動畫,做出「棘輪感」。
- **棘輪齒距**:右鍵旋鈕 → 迷你選單選步進值(依參數合理提供,如 LUFS:0.1 / 0.5 / 1;位元率:16 / 32 / 64k),每個旋鈕的選擇獨立記憶。
- **雙擊直接輸入**:旋鈕變行內數字輸入框,Enter 確認、Esc 取消,超出範圍自動 clamp。
- **甩動慣性(智慧滾輪效果)**:快速拖曳並鬆手(釋放瞬間速度超過門檻)→ 進入**無阻力模式**:數值隨慣性連續滑動、摩擦力逐漸衰減至停,期間無 detent 吸附——如同羅技滑鼠滾輪解鎖棘輪的手感;再次按住、或撞到參數邊界,立即恢復棘輪模式。實作:pointer events 記錄釋放速度 + `requestAnimationFrame` 慣性衰減曲線。
- **滾輪微調**:游標懸停時,滾輪一格 = 一個 detent。
- 旋鈕即時顯示當前值與單位;每個參數定義 min/max/預設,一律 clamp。

### 參數面板 = schema 驅動(條件顯示)
每個功能定義自己的參數 schema(key、型別、範圍、預設、顯示條件);面板只渲染**當前功能 + 當前選項組合**用得到的控件——用不到的參數**完全不出現**(不是灰掉,是不存在),與 Shutter Encoder 行為一致。例:Extract 選「原格式無損」時沒有任何編碼參數;Replacement 選「保留完整影片」時不出現 codec=copy 選項;多軌工作流中「保持原樣」的軌不出現 LUFS 旋鈕。

### 預覽面板
- 點左右任一欄的任一列 → 載入預覽:影片顯示畫面 + 波形;純音訊顯示大波形。
- **波形圖**:不用 WebAudio 解碼(格式受限)。由 main process 以 `ffmpeg -i IN -map 0:a:0 -ac 1 -ar 4000 -f s16le -` 取 PCM,算出約 2000 個 min/max peak buckets 傳給 renderer 畫 canvas。已分析過 true peak 的檔案,在波形上畫目標 TP 參考線。播放游標同步、點波形可 seek。
- **格式相容**:Chromium 可直接播的(h264/vp9/av1 + aac/mp3/flac/wav/ogg 等)直接經 `media://` 播;不支援的格式自動背景產生 proxy(NVENC 可用時 `-vf scale=-2:480 -c:v h264_nvenc -preset p1 -c:a aac -b:a 128k`,否則 `libx264 -preset ultrafast -crf 28`;純音訊則 aac 192k),期間顯示「產生預覽中…」進度。
- Replacement 模式:預覽多出「原音軌 / 新音軌」A/B 切換鈕。

### 互動細節
- 拖放時整個視窗出現高亮外框提示;不支援的檔案被拒時 toast 說明原因。
- 所有按鈕有 hover/active 態;處理中的列有進度動畫;完成的列可一鍵「開啟輸出資料夾」。

---

## 6. 設定(齒輪面板)

- 輸出位置:與來源相同資料夾(預設)/ 指定固定資料夾
- 同時處理數(1–6)
- 主題(淺/深/跟隨系統)、語言(繁中/English)
- 硬體加速:自動(預設)/ 停用;並顯示偵測到的 GPU 型號與可用編碼器
- 全部以 electron-store 持久化,含各功能面板的上次參數。

---

## 7. 打包與便攜性

- `electron-builder`:NSIS、x64、`oneClick: false`(讓用戶可選安裝路徑)、產生桌面捷徑。
- `bin/ffmpeg.exe`、`bin/ffprobe.exe` 以 `extraResources` 打包。
- App icon:以簡單 SVG 生成 256px `.ico` placeholder 即可,不必精美。
- **Phase 0 就要先跑一次完整打包冒煙測試**(空殼 app → installer → 安裝可啟動),避免最後才發現打包鏈有問題。

---

## 8. 錯誤處理(只做這些,不多做)

- FFmpeg exit code ≠ 0 → 該任務標「失敗」,保留 stderr 尾段供查看,不中斷佇列其他任務。
- 來源檔不可讀/副檔名不支援 → 拒入佇列 + toast。
- 其他情況信任框架與內部程式碼,不添加防禦性程式。

---

## 9. 已預先決策清單(遇到就照做,不要問)

1. 名稱:**AudioForge**;productName、視窗標題、installer 名稱皆同。
2. UI 雙語:繁體中文(預設)+ English;自製輕量 dictionary,不引入 i18next。
3. 只支援 Windows x64,不考慮 mac/Linux。
4. 支援副檔名:影片 `mp4 mov mkv avi webm m4v mts m2ts mxf`;音訊 `wav mp3 flac aac m4a ogg opus wma aiff ac3`。
5. 檔名衝突 → ` (1)` 遞增;永不覆寫、永不刪除來源檔。
6. 多音軌預設取第 1 軌(analysis/normalization/conversion/preview 皆同);只有 Extract 開放選軌。
7. proxy 與波形快取放 `app.getPath('temp')/audioforge-cache/`,以「來源路徑+mtime」為 key;app 啟動時清除 7 天前的快取。
8. loudnorm 一律 `linear=true`、LRA=11。
9. 取樣率一律跟隨來源,除非 Conversion 面板明確指定。
10. 開發時下載 FFmpeg:從 gyan.dev 抓 `ffmpeg-release-essentials.zip`,解出兩個 exe 到 `bin/`。若網路不可用,這是唯一允許問用戶的情況。
11. 明確**不做**:視訊轉碼、剪輯、字幕、GPU 編碼、自動更新、多語言。
12. 測試媒體自行以 FFmpeg 生成(`testsrc2` + `sine` 合成短片、各格式音訊),不依賴用戶提供檔案。
13. 「⬅ 移至來源」語意 = 加入左欄並自右欄移除;若該路徑已在左欄則只自右欄移除。右欄清單不跨 session 持久化。
14. NVENC 試編失敗(驅動/環境問題)→ 靜默退回 libx264 ultrafast,只在設定頁顯示狀態,不彈錯誤視窗。
15. 拖放取路徑一律用 `webUtils.getPathForFile()`;左欄同一路徑不重複加入。
16. 多軌混音一律 `amix normalize=0`;保險限制器預設開、上限取全域 TP 目標;批次時依音軌序號對應設定。
17. 旋鈕棘輪步進預設:LUFS/TP 為 0.5,可右鍵改 0.1/0.5/1;各旋鈕步進與各軌參數皆獨立持久化。
18. 多軌工作流的每軌參數記憶以「軌序號」為 key(軌 1、軌 2…),不綁定特定檔案。

---

## 10. 開發流程

### Phase 規劃(共約 25 個任務)
- **Phase 0 — 地基(4)**:electron-vite scaffold → 下載/放置 FFmpeg → media:// 協定 + IPC 骨架 → **打包冒煙測試**
- **Phase 1 — 引擎(6)**:ffprobe wrapper → ffmpeg spawn + 進度解析 → 硬體偵測(encoders 列表 + 1 幀試編)→ 佇列管理器(平行調度)→ 輸出路徑/衝突規則 → 快取層
- **Phase 2 — UI 骨架(7)**:版面 + 側欄 → 主題系統 → i18n 系統 → 拖放 + 雙欄工作區(勾選/清除/移至來源)→ **旋鈕元件(棘輪/慣性/雙擊/右鍵齒距)** → 參數面板 schema 框架(條件顯示)→ 設定面板
- **Phase 3 — 六功能(6)**:analysis → normalization → extract → conversion → replacement → **multi-track(招牌功能,排最後因為它疊加前面所有引擎能力)**
- **Phase 4 — 預覽(4)**:播放器 + media:// → 波形 pipeline → proxy fallback → A/B 切換
- **Phase 5 — 收尾(2+)**:全功能端到端測試(用自生成測試檔跑五功能各一次,檢查輸出檔的 ffprobe 結果)→ 正式打包 + README

### 自檢機制(必須遵守)
- **每完成 5 個任務**,派一個 subagent(general-purpose,Sonnet)以本規格文件為 checklist,驗證這 5 個任務的實作與規格一致(讀程式碼、必要時執行驗證指令),回報偏差後立即修正再繼續。
- 分工:**全部實作由主 agent(Fable 5)親自完成**——本專案規模中等、跨檔耦合高(IPC / 佇列 / UI 狀態彼此牽動),自行實作的一致性與正確率優於分包;subagent 只用於上述每 5 任務的獨立規格驗收。
- 最終驗收:`npm run build` 產出 installer;至少啟動 unpacked exe,實跑五功能,以 ffprobe 驗證輸出(normalization 後重測 LUFS 應在目標 ±0.5 內;extract 的 codec 應與來源一致;replacement 的視訊流 hash/codec 不變)。

---

## 11. 驗收標準(全部打勾才算完成)

- [ ] NSIS 安裝包可在乾淨 Windows 上安裝並啟動,無需任何外部環境
- [ ] 拖入多檔進左欄,平行 2+ 任務同時處理,各自進度條正確
- [ ] 雙欄工作流:只處理已勾選檔案;清除全部一鍵清空;輸出自動入右欄;「移至來源」後可直接再處理
- [ ] 繁/英切換即時生效、無 hardcode 字串、重啟後保留
- [ ] 硬體偵測正確(RTX 5070 Ti 應啟用 NVENC 並顯示於設定頁),proxy 以 GPU 產生;「停用」時自動退回 CPU 且功能不受影響
- [ ] 分析:對測試檔報出 LUFS/LU/dBTP,與 ffmpeg 命令列手跑結果一致
- [ ] 正規化:輸出重測 Integrated 在目標 ±0.5 LU、TP 不超標;影片輸入時視訊流為 copy(bit 相同)
- [ ] 替換:輸出影片畫面流未重編、字幕保留、音軌為新音訊;A/B 試聽可用
- [ ] 抽取:aac→m4a 等 stream copy 對應正確;多軌選擇可用
- [ ] 轉檔:四種格式各參數組合輸出可播放且規格正確
- [ ] 深/淺主題完整切換無漏刷,選擇與設定重啟後保留
- [ ] 預覽:常見格式直接播、冷門格式自動 proxy、波形顯示與 seek 正常
- [ ] 檔名衝突自動遞增,來源檔完好
- [ ] 失敗任務顯示錯誤且不影響佇列其他任務
- [ ] 多軌工作流:自生成「1 視訊 + 2 音軌」測試檔,軌 1 → -20 LUFS、軌 2 → -14 LUFS 一次完成混音寫回;畫面流 bit 不變;「保留多軌」模式下各軌重測 LUFS 在目標 ±0.5 內;整個流程只讀 2 次寫 1 次(無中間檔)
- [ ] 旋鈕:棘輪吸附、右鍵改齒距、雙擊輸入、甩動慣性滑行、滾輪微調全部可用,參數與齒距重啟後保留
- [ ] 條件參數:切換功能/選項時,不相關的參數控件完全不渲染
