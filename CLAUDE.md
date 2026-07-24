# AudioForge

影片/音訊音軌處理軟體(精簡版 Shutter Encoder)。Electron + React 19 + TS + electron-vite。
**動手前先讀 `docs/DEV-NOTES.md`** —— 技術棧、測試方式、每個踩過的坑都在那;
近期進度看 `git log`(commit 訊息寫得很詳細)。這裡只放每次都要遵守的規則。

## 設計原則(所有取捨的北極星)
- 介面簡單好看、操作直觀,不要複雜;用起來輕便、快速、有效率。
- 用不到的參數不該「存在」(而非只是變灰)——依情境只顯示當下有意義的選項。
- 效率優先:能 stream copy 就不重編碼;能一次讀取算完就不重複解碼。

## 工作方式
- 有足夠資訊就動手;要抉擇時給建議,不窮舉選項。
- 不做超出任務範圍的重構/抽象/防呆;相信內部程式碼與框架保證。
- 報告前用這個 session 的 tool 結果核對每個宣稱;沒驗證的明講,測試失敗就貼輸出。

## 驗證
- 改後端(FFmpeg 管線/runner)→ 跑冒煙 `AUDIOFORGE_SMOKE=1`(見 DEV-NOTES),要全過。
- 改前端 → `npx tsc --noEmit` + `npx electron-vite build`。
- 純 UI 手感(旋鈕、卡片互動)無法無頭驗證,要提醒使用者實機確認。

## 發版
改 package.json version → commit → `git tag vX.Y.Z` → push → 打包(`npx electron-builder`)
→ 確認新產物存在後才刪舊版。**單一 main 分支**(不做 exp/main 雙分支,那是別的專案的規則)。

## 打包 / UI 慣例
- 遇 EBUSY(release/win-unpacked 被鎖)→ 直接強制關閉所有 AudioForge 程序再打包。
- UI 文案不加多餘補充句(太有 AI 感);UI 不用 emoji;內部用詞(如混音的
  base/ingredient)不給使用者看,對外用「主音軌 / 混入」。
