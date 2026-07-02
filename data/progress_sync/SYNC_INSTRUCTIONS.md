# 進度資料夾 → AI Team OS 自動同步規則

你被一個檔案異動監控腳本喚醒，因為 `C:\Users\andyl\Documents\進度\` 底下有檔案被新增或修改。你要做的是把這個變更安全地同步進 AI Team OS 的任務牆，**不確定的時候寧可跳過，不要亂猜**。

## 專案對照表

讀取 `C:\Users\andyl\Documents\AI-company\data\progress_sync\projects_map.json`，裡面有 6 個資料夾名稱對應的 `project_id`。呼叫你這次的訊息會告訴你是哪個檔案變了，先判斷它屬於哪個專案資料夾（看路徑），對不到任何專案就跳過並記 log。

## 你可以用的 API（base: http://localhost:8000）

- `GET /api/projects/{project_id}/task-wall` — 看目前這個專案任務牆上已有哪些任務（含標題、狀態、tags）
- `POST /api/projects/{project_id}/tasks` — 新增任務，body: `{"title","description","priority","horizon","tags":["進度匯入"]}`
- `PUT /api/tasks/{task_id}` — 更新任務（例如補充 description）
- `PUT /api/tasks/{task_id}/complete` — 把任務標記完成
- `GET /api/reports?project_id={project_id}&report_type=半日回報` — 看這個專案已經上傳過哪些半日回報（避免重複上傳同一份）
- `POST /api/reports` — 把半日回報全文存成可在 Dashboard「研究報告」頁面瀏覽的文字檔。**注意：project_id 不是放在 body，是放在 HTTP header `X-Project-Id`**。body: `{"author","topic","content","report_type":"半日回報"}`

## 半日回報全文上傳規則（新增檔案在 `半日回報/` 底下時一定要做）

1. 檔名格式通常是 `YYYYMMDD_上午或下午_姓名_專案_半日進度回報.md`，從檔名解析出日期、時段、姓名（author）。
2. 用 `GET /api/reports?project_id=...&report_type=半日回報` 先看有沒有同檔名/同 topic 的報告已存在，**避免重複上傳**（watcher 有時對同一次存檔會多次觸發）。
3. 沒有重複的話，讀取檔案全文，呼叫 `POST /api/reports`：
   - `author` = 檔名解析出的姓名（解析不出來就用「未知」）
   - `topic` = `{專案名稱} {日期}{上午/下午}半日回報`
   - `content` = 檔案全文（不要摘要、不要改寫，原文存檔）
   - `report_type` = `"半日回報"`
   - HTTP header 加 `X-Project-Id: {project_id}`
4. 這一步跟「同步任務牆」是獨立的兩件事，兩個都要做：半日回報全文變成可瀏覽的報告文字檔，同時裡面的「下一步/風險/決策」還是要照下面規則抽成任務。

## 同步規則（保守優先）

1. **只處理 `進度紀錄.md` 或 `半日回報/` 資料夾底下新增的 `.md` 檔案**，`交接檔/`、`測試紀錄/`、`截圖/` 底下的檔案只讀不處理（可能沒有結構化文字內容）。
2. 讀取異動檔案全文，抓出「下一步建議」「需要決策事項」「風險提醒」裡**具體可執行**的項目（不要把「避免混淆已開發/已測試」這類原則性提醒也當任務）。
3. 呼叫該專案的 `task-wall`，逐條比對：
   - 語意上已經存在（哪怕文字不同）的項目 → **跳過**，不要重複建立。
   - 全新的具體待辦 → 用 `POST .../tasks` 新增，tags 用 `["進度匯入"]`，priority/horizon 依急迫程度判斷（P0/阻塞/易遺失 → critical；高優先 → high；一般下一步 → medium；待確認的長期規劃 → low/mid）。
   - 檔案裡明確講「已完成／已 commit／已解決」對應到牆上某個既有任務 → 呼叫 `PUT /api/tasks/{id}/complete` 標記完成。
4. 每次同步完，在 `C:\Users\andyl\Documents\AI-company\data\progress_sync\sync_log.md` 用 Edit 工具**附加**一段紀錄（不要覆蓋整個檔案），格式：
   ```
   ## {ISO時間戳} — {專案名稱}
   - 來源檔案：{路徑}
   - 半日回報上傳：{是/否/已存在跳過}（report_id 如有）
   - 新增任務：{n} 條（列標題）
   - 標記完成：{n} 條（列標題）
   - 跳過原因（如有）：{說明}
   ```
5. 如果讀不到 task-wall（API 沒開）或檔案內容看起來是半成品/正在寫（例如明顯被截斷），**跳過並記 log**，不要硬處理。
6. 不要刪除任務、不要修改跟這次異動無關的任務、不要因為一次同步失敗就重試造成重複。
