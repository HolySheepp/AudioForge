# AudioForge

精簡高效的音訊批次處理工作站(簡化版 Shutter Encoder)。
A lean, fast audio batch-processing workstation (a simplified Shutter Encoder).

## 功能

| 功能 | 說明 | 重新編碼? |
|---|---|---|
| 響度分析 | EBU R128:Integrated LUFS / LRA / True Peak | 否(只讀取) |
| 響度標準化 | 兩段式 loudnorm(linear),不破壞動態 | 只重編音訊;影片畫面流 copy |
| 音軌替換 | 換音軌保留字幕/章節,可 A/B 對照試聽 | 畫面流 copy |
| 抽取音軌 | 依 codec 無損 stream copy(aac→m4a、pcm→wav…) | 否 |
| 音訊轉檔 | WAV / MP3 / AAC / FLAC | 是 |
| 多軌工作流 | 各音軌分別標準化 → 混音 → 寫回影片,一步完成 | 畫面流 copy,讀 2 寫 1、零中間檔 |

- 雙欄工作區:左欄來源(勾選處理)、右欄輸出(一鍵移回來源再處理)
- 檔案只以路徑引用,絕不複製、絕不覆寫來源
- 平行佇列(1–6 個 FFmpeg 同時)
- 深/淺主題、繁中/English
- 啟動時偵測 NVENC/QSV/AMF(1 幀實測),proxy 預覽走 GPU
- 內建 FFmpeg,安裝即用

## 從 GitHub clone 後的安裝步驟

FFmpeg 二進位檔(>100MB)不進 repo,clone 後跑一次下載腳本即可:

```bash
git clone <repo-url>
cd AudioForge
npm install
npm run setup:ffmpeg   # 下載 FFmpeg 到 bin/(約 110MB,只需一次)
npm run dev            # 開發模式直接試
npm run dist           # 打包 NSIS 安裝包(release/)
```

開發相關的細節、已知坑、版本流程約定見 [docs/DEV-NOTES.md](docs/DEV-NOTES.md);
原始規格文件見 [docs/PROMPT.md](docs/PROMPT.md)。

## 開發

```bash
npm run dev        # 開發模式
npm run build      # 建置
npm run dist       # 建置 + 打包 NSIS 安裝包(release/)
npm run smoke      # 端到端冒煙測試(六功能,自產測試媒體,21 項驗證)
```

`bin/ffmpeg.exe` 與 `bin/ffprobe.exe` 需存在(gyan.dev release-essentials build),打包時隨 `extraResources` 帶入。

**硬體加速註記**:FFmpeg 8.x 的 NVENC 需要 NVIDIA 驅動 ≥ 610;驅動過舊時 app 會自動實測失敗並改用 QSV 或 CPU,驅動更新後自動恢復 NVENC,無需設定。

## 授權註記

本軟體內含 [FFmpeg](https://ffmpeg.org)(gyan.dev 建置,GPL 授權)。若公開散布本軟體,需一併提供 FFmpeg 授權聲明與其原始碼取得方式(https://github.com/FFmpeg/FFmpeg)。個人使用不受影響。

App 本體 MIT 授權。
