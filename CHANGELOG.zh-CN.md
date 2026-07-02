# 變更日誌

AI Team OS 的所有重要變更均記錄在此檔案中。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)

## [Unreleased]

### 修復

- **專案詳情頁團隊列表消失**：`apiFetch` 原先把 `X-Project-Id` 頭注入到*所有*請求，導致殘留在 `localStorage` 的全域性專案 pin 把 `/api/teams` 也限定到單一專案。ProjectDetailPage 是拉全量團隊後客戶端按 `project_id === projectId` 過濾，被限定後過濾結果為空，於是每個專案的活躍/歷史團隊全部消失。現把 `X-Project-Id` / `X-Project-Dir` 頭**硬性限定為只給 `/api/ecosystem` 請求**，其它端點永不被專案作用域影響。

### 變更

- **生態庫專案篩選歸位**：專案篩選下拉本屬於「按專案檢視生態庫」的功能，卻被掛成全域性 Header 切換器（`components/layout/ProjectSwitcher`）並在 `client.ts` 註釋為「Global project context」，因而被誤當成全域性應用切換器。現移除全域性 Header 處的切換器，元件改名 `EcosystemProjectFilter` 並遷至 `components/ecosystem/`，僅在 `/ecosystem` 列表頁提供；相關注釋補充歷史教訓與「勿全域性化」硬約束以防復發。
- **專案詳情頭部佈局重排**：描述獨佔整行（長描述可讀性最優），當前團隊 / 歷史團隊 / 建立時間三項緊湊成一排，不再四等分擠壓描述。

## [1.5.0] — 2026-05-08

### 新增 — 生態研究平臺 v2：漸進式深掃漏斗

把 v1.4.0 的"一次性 5 段深掃"重構為 **4 階段漸進式知識庫漏斗**，讓生態倉研究產物**累加而非一次性產出**。基於使用者敲定語義實施，避免低價值倉浪費 token，並支援研究產物跨週期複用召回。

- **Stage 0 — 入檔即淺掃（Stage A/B）**
  - 新建 `EcosystemShallowQueueWorker`（552 行），自動派 `ai-engineer` agent（5 併發）總結新入檔倉
  - 淺掃內容：核心功能 / 定位 / 優勢 / 適用場景（200-400 字）
  - Worker 每 5 分鐘跑一次，返回 `DispatchIntent[]`（不直接 spawn agent — Leader 用 Agent 工具 + `team_name=ecosystem-platform` 實際派遣）
  - **8 類失敗分類處理**：404→mark_deleted / 403_私密→mark_private / rate_limit→backoff+重試 / 5xx→指數退避重試 / agent_read→重試+換 agent / agent_timeout / json_parse→帶示例重試 / fetch_style→pattern_record
  - **失敗自學習機制**：同類 `fetch_style` 失敗 ≥ 3 個不同倉 → 自動 `pattern_record(type='failure')`，未來 agent 通過 `pattern_search` 讀到 lessons 最佳化策略

- **Stage 1 — 按需架構分析（Stage C）**
  - 新增 `ecosystem_deep_review_request_batch(tags, min_stars, limit)` MCP 工具
  - 使用者挑研究方向（如 "memory_system"）→ 批次派 `backend-architect` 讀架構關鍵檔案
  - 輸出：`architecture_md` 欄位 + `stage_status='architecture_done'`

- **Stage 2 — 多角度辯論（Stage C）**
  - 新增 `ecosystem_trigger_debate(repo_ids, research_goal)` 直接調現有 `debate_start`（**不內建辯論引擎**，複用會議系統）
  - Leader 完全掌控辯論參與者和輪次（保留現有會議系統能力）
  - **會議→生態庫反向寫入 hook**（`meeting_ecosystem_writeback.py`）：會議結束 + topic 含生態關鍵詞時，hook 提醒 Leader 派 agent 調 `ecosystem_apply_debate_result(risks_md / learnings_md / integration_md / integration_recommendation)`
  - 輸出：每個 finalist 4 欄位 + `stage_status='debated'`

- **Stage 3 — 參考 / 整合標記（Stage C）**
  - `ecosystem_mark_as_reference` 加 `lifecycle:reference` tag + `stage_status='referenced'`
  - `ecosystem_start_integration` 加 `lifecycle:integrated` tag + 通過 `task_create` 建立真實整合任務（**不內建實施引擎**，複用任務系統）
  - 兩路徑都保留研究產物便於未來快速召回（避免重複深掃）

### 新增 — 專案可定製閾值（Stage A）

- 新建 `EcosystemProjectSettings` 表（每專案獨立）：`min_stars` / `top_n` / `refresh_interval_days` / `focus_topics` / `focus_languages` / `shallow_concurrency` / `deep_concurrency`
- AI Team OS 預設：`min_stars=5000, top_n=200, focus_topics=['claude-code','mcp','agent-framework']`
- 其他專案預設：`min_stars=1000, top_n=100`

### 新增 — 活躍/全量雙檢視 + 資料 append-only（Stage A/D）

- **決策 D**：資料**永不刪除** — stars 跌出閾值的倉不刪，僅 `is_active=False`；stars 漲回 → 自動啟用 + 重新入隊 Stage 0
- **決策 E**：週期淺掃**只掃活躍集**（top_n by stars），節省 GitHub API 配額
- 新建 `EcosystemRepoStatusSnapshot` 表，每次 scan 記錄 stars/pushed_at/is_archived/is_active 供歷史分析
- 新建 `EcosystemRefresher` service（480 行）：`shallow_refresh()`（diff 跳過 last_pushed_at 未變的倉）+ `recompute_active_set()` + `resurrect()`（刪庫/私密復活）

### 新增 — 前端漏斗 UI（Stage E）

- 列表頁：stage 顏色徽章（queued/shallow_done/architecture_done/debated/referenced/integrated/_failed）+ 3 tab（活躍/全量/已刪除）
- 詳情頁：新增"研究歷程"timeline tab，顯示 stage 推進 + agent 輸出 + `shallow_summary_history` 歷史快照
- 新頁面 `/ecosystem/research` 候選篩選：輸入研究目標 → tags 候選列表 + 淺掃 summary 預覽 → 多選觸發 Stage 1 → finalists 觸發 Stage 2
- 專案詳情頁加 "Ecosystem 設定" tab，8 欄位（min_stars / top_n / refresh_interval_days / focus_topics / focus_languages / shallow_concurrency / deep_concurrency / auto_shallow_on_archive）
- 失敗倉：紅色徽章 + "立即重試"按鈕（調 `POST /api/ecosystem/profiles/{id}/retry`）

### 新增 — 11 個新 MCP 工具

- Stage 0: `ecosystem_apply_shallow_summary`, `ecosystem_shallow_queue_status`
- Stage 1: `ecosystem_deep_review_request_batch`, `ecosystem_apply_architecture_md`
- Stage 2: `ecosystem_trigger_debate`, `ecosystem_link_debate_meeting`, `ecosystem_apply_debate_result`
- Stage 3: `ecosystem_mark_as_reference`, `ecosystem_start_integration`, `ecosystem_link_integration_task`
- Refresh: (擴充套件 `ecosystem_scan_periodic` 加 refresh 策略)

### 新增 — 8 個新 REST 端點

- `/api/ecosystem/lifecycle/*`（Stage 1/2/3 觸發鏈路）
- `/api/ecosystem/profiles/{id}/retry`（失敗倉手動重試）
- `GET/PUT /api/ecosystem/projects/{project_id}/settings`
- `POST /api/ecosystem/shallow_queue/{apply_summary,tick}`, `GET /api/ecosystem/shallow_queue/status`

### Schema 變更（Stage A — 通過 COLUMNS_TO_ENSURE 完全向後相容）

- `EcosystemDeepReview` +8 欄位：`stage_status` enum / `integration_md` / 4 個 stage 時間戳 / `debate_meeting_id` / `integration_task_id`
- `EcosystemRepoProfile` +8 欄位：`shallow_summary` / `last_shallow_refreshed_at` / `is_deleted` / `is_private_now` / `last_fetch_error` / `fetch_failure_count` / `is_active` / `active_rank`
- 2 張新表：`EcosystemRepoStatusSnapshot`（append-only 歷史）/ `EcosystemProjectSettings`（每專案配置）
- 標籤字典：26 → 31（新增 5 個 lifecycle 標籤：`evaluating` / `reference` / `integrated` / `deleted` / `private_now`）
- Tag source enum +1：`lifecycle`（Stage 3 轉換自動管理）

### 測試

- 1283+ 單元測試通過（1264 baseline + 110+ 新 ecosystem 測試覆蓋 A/B/C/D/E）
- 0 迴歸
- 6 pre-existing failures（CLI version flag / debate template / mcp_autostart / pipeline）經 `git stash` 驗證與本次無關

### 架構決策（使用者敲定）

- **(A)** Ecosystem 是**知識庫不是工作流引擎** — Stage 2 複用 `debate_start`，Stage 3 複用 `task_create`。Ecosystem 只做記錄、召回、標註。
- **(B)** 會議→生態庫反向寫入 hook 提醒 Leader 把辯論結論回寫生態庫（保留 Leader 決策權）
- **(C)** 每個專案獨立閾值 + 活躍/全量雙檢視
- **(D)** 資料 append-only 永不刪除；星標跌出的倉保留以備未來複活
- **(E)** 週期淺掃只掃活躍集
- **(F)** Rate limit 測試驅動併發調優（不預設，實測調整）

### 備註

- 本版本**僅釋出到 GitHub**（延續 v1.4.0 開發里程碑模式），PyPI 釋出留待後續穩定性驗證

## [1.4.0] — 2026-05-07

### 新增 — 生態研究平臺（Stage A-J）

完整的專案隔離開源生態發現/打標/深度審查平臺。專為 Claude/MCP/agent 開源生態設計。首掃入檔 188 倉，三層打標平均 2.05 tags/repo，0 標籤率僅 1.5%。

- **資料層（Stage B）** — 5 張新表：`EcosystemRepoProfile` 擴充套件 + `EcosystemDeepReview` 深掃報告 + `EcosystemTag` 標籤字典 + `EcosystemRepoTag` 關聯 + `EcosystemRelation` 倉與倉關係 + `EcosystemScanRun` 掃描批次。21 個 seed 標籤；刪除倉檔案 CASCADE 刪除關聯，刪標籤 RESTRICT；50/50 單元測試。

- **週期掃描（Stage C）** — `EcosystemScanner` 服務，增量策略（< 7 天掃過的跳過）+ 全量策略 + ScanRun 審計 + GitHub API 優雅降級 + owner 黑名單 + 關鍵詞白名單二次過濾。3 個新 MCP 工具（`ecosystem_scan_periodic` / `ecosystem_scan_status` / `ecosystem_scan_history`）+ 5 個 REST 端點 + 31 個新測試。

- **三層打標（Stage D）** — Layer 1 GitHub topics 直接對映（命中 105 倉）+ Layer 2 關鍵詞規則（命中 70 倉）+ Layer 3 LLM dispatch_plan 模式派子 agent。5 個新 MCP 工具 + 26 個標籤字典（capability/tech_stack/maturity/positioning 四類）+ 48 個單元測試。

- **多維搜尋（Stage E）** — `ecosystem_search` 升級到 11 個引數（query/tags AND/min_stars/language/sort_by/has_deep_review 等），`ecosystem_repo_get` 返回 profile+tags+deep_reviews+relations+scan_run 全息詳情，`ecosystem_search_by_capability` 按標籤反向檢索。SQLite NULLS LAST 模擬 + EXISTS subquery 實現 tag AND 語義。38 新測試，p95 < 50ms 目標。

- **深掃工作流（Stage F）** — 5 段式報告模板（真實定位 / 架構 / 借鑑點 / 風險 / 整合建議）+ `EcosystemDeepReviewer` 服務通過 `dispatch_plan` 派 Explore + backend-architect 子 agent（相容 CC 子程序模型）+ PostToolUse `deep_review_link.py` hook 自動關聯 report 到 `EcosystemDeepReview.report_id`。4 個新 MCP 工具 + 5 個 REST 端點 + 19 個新測試。

- **自動彙總（Stage G）** — 4 個 markdown 彙總工具：`ecosystem_summary_weekly`（週報）/ `ecosystem_summary_by_tag`（按方向）/ `ecosystem_summary_top_n`（Top N 排行）/ `ecosystem_summary_health`（平臺自檢）。自動 `report_save`（報告型別 `ecosystem-{weekly,by-tag,top-n,health}`）。Join 一次拉完避免 N+1。33 個新測試。

- **前端（Stage H）** — `/ecosystem` 列表頁（4 列卡片 + 篩選欄 + 分頁），`/ecosystem/:repoId` 詳情頁 + 4 個新元件（`CapabilityTags` / `DeepReviewSection` / `RelationsSection` / `ScanRunSection`），通過 `useEcosystemRepoFull` hook 消費 v2 API（UUID → full_name 反查 + path 段編碼）。響應式 + Playwright 截圖驗證。

- **專案隔離（Stage J）** — 6 張 ecosystem 表全部加 nullable `project_id` 列；`EcosystemRepoProfile` 用 `(project_id, repo_full_name)` 聯合 UNIQUE。`EcosystemTag` 字典保持 `project_id=NULL`（全域性共享 21 seed）。`X-Project-Id` HTTP header → `get_scoped_repository` 路由；MCP `_api_call` 自動注入（基於 cwd 推斷的 session 專案）。啟動時自動 `backfill_ecosystem_to_project` 鉤子遷移歷史 188 倉到 AI Team OS 專案。前端 `setCurrentProjectId` 切換專案時同步。10 個隔離測試 + 1109 全套 unit 測試通過。

### 新增 — 標籤質量打磨（Stage K4）

- **`ecosystem_tag_apply_batch` 加 `replace_auto` 模式** — 替換模式（預設 `False` 向後相容）：先刪除該倉所有 `auto_rule` 和 `github_topic` 來源的 RepoTag 行（保留 `manual` 和 `auto_llm`），再插入新規則的結果。修復了"新規則雖產生新標籤但舊 `mcp_framework` 假陽性 99 倉沒清"的 bug。

- **5 個新標籤 + 邊界規則** — `claude_code` / `agent_harness` / `javascript` / `java` / `docs_only` 加入 seed 字典。新增 `LANGUAGE_TAG_MAP`、`DOCS_ONLY_LANGUAGES`、`DOCS_ONLY_NAME_PATTERNS` 三組 Layer 2 子規則。`mcp_framework` 假陽性率從 37%（99/265）降到 **0.8%（2/265）**，平均標籤數從 **1.01 → 2.05**，0 標籤率從 **28.7% → 1.5%**。

- **18+ 邊界倉實地調研** — `docs/ecosystem-tag-edge-cases.md` 記錄真實 anomaly（n8n / dify / awesome-mcp-servers / claude-cookbooks / hermes-agent / netdata / JavaGuide 等）+ 根因 + 規則修復。

### 效能 — 搜尋最佳化（Stage K1）

- **`ecosystem_repo_profiles` 加 5 個複合索引**：`(project_id, stars)` / `(project_id, category, stars)` / `(project_id, language, stars)` / `(project_id, pushed_at)` / `(project_id, is_archived, stars)`。EXPLAIN QUERY PLAN 驗證 TEMP B-TREE 全部消除。

- **search p95：2057ms → 13.1ms（156x 提升）** — 100 次 random query 實測（真實生產資料，265 倉）。p50 6.6ms / p99 25ms。

- **`ecosystem_search` 預設行為修復** — `tags=[]` 現在跳過 EXISTS subquery（避免全表掃），返回按 stars 排序的全集而非空。

- `compute_ecosystem_facet_counts` 重構為單次 SELECT 三列 + Python 聚合（IO 減 2/3）。

- 6 個新效能 regression 測試。

### 修復

- **`context_tracker` 新 model 變體的 1M 檢測** — `claude-opus-4-7` 等新 opus 模型在 1M 模式下被誤判為 200K window，導致 198K tokens 時報告 99% 假警告。兩層檢測：(1) 精確 `{model}[1m]` 匹配；(2) 同 family 兜底（任意 `claude-{opus|sonnet|haiku}-*[1m]` 歷史 → 該 family 視為 1M）。新增 `CLAUDE_CONTEXT_SIZE` env 終極覆蓋。4 個新測試 + module 級 autouse fixture 隔離 `~/.claude.json`。

- **新 agent 註冊到 completed 團隊自動恢復** — hook_translator 現在檢測到新 agent 註冊到 `status=completed` 的團隊時自動恢復為 `active` 併發出 `team.auto_revived` 事件 + 警告日誌。替代了之前的硬阻斷方式（曾導致歷史團隊上的長任務被中斷）。

### 前端 bug 修復（Stage K2）

- **詳情頁 `深度檔案區` 佔位符移除** — 之前詳情頁硬編碼 "TODO: Stage E v2 API" 佔位文案，但 v2 API（`/profiles/{name}/full`）從 Stage E 起就已存在。`useEcosystemRepoFull` hook 現在直接消費 v2（含 UUID → full_name 反查 + path 段斜槓編碼）。v2 失敗時優雅降級到 v1 列表資料。

### 變更

- **Plugin description 升級** — 反映 140+ MCP 工具（含 30+ 生態研究工具）+ 生態研究平臺。新增 marketplace 標籤：`ecosystem-research`、`github-discovery`、`code-mining`。

## [1.3.4] — 2026-04-14

### 修復
- **緊急：升級自 1.3.0 之前版本的資料庫上 `meeting_send_message` 500** — 1.3.3 的 `_sqlite_migrate()` 補了 `meetings.meta_json`，但漏掉了 `meeting_messages.metadata_json`。老資料庫（在該欄位加入 ORM 模型前建立）上的所有 `meeting_messages` INSERT/SELECT 都會拋 `OperationalError`。修復方案：將 `_sqlite_migrate()` 重構為資料驅動迴圈，統一遍歷 `COLUMNS_TO_ENSURE` 列表（同時覆蓋 `meetings.meta_json`）。所有遷移項均通過 `PRAGMA table_info` 保護，冪等安全。
- **遷移框架改為資料驅動** — 未來新增欄位只需在 `COLUMNS_TO_ENSURE` 列表 append 一行。

## [1.3.3] — 2026-04-14

### 修復
- **緊急：外部專案呼叫 `meeting_create` API 崩潰 500** — 三個根因一次修復：
  1. **`meta_json` 列缺失** — 舊資料庫 `meetings` 表沒有該列（該欄位加入 ORM 模型前建立的庫），`init_db` 用 `create_all` 不會為已存在表補列，INSERT 直接報 `OperationalError`。新增 `connection.py` 啟動時冪等 SQLite 遷移，缺列則 `ALTER TABLE` 補全。
  2. **team_id 未按名稱解析** — `POST /api/teams/{team_id}/meetings` 路由接收團隊名（如 `"repo-insight-build"`）但未轉 UUID，直接傳給倉儲層導致後續查詢靜默失敗。路由現在先按 UUID 查、再按 name 查，都找不到返回 HTTP 404。
  3. **ORM 異常未捕獲導致 worker 假卡** — `create_meeting` 呼叫外圍加 `try/except`，DB 錯誤以 HTTP 500 JSON 返回，不再讓 worker 卡死。

## [1.3.2] — 2026-04-14

### 修復
- **緊急：MCP 動態埠發現失效** — `plugin/.mcp.json` 把 `AITEAM_API_URL=http://localhost:8000` 硬編碼為 env var，覆蓋了 `_get_api_url()` 中的動態埠 fallback。當 autostart 因 8000 被佔用而選擇空閒埠（如 59711）時，MCP 工具仍連線 8000 並報告 `unhealthy`，而 hook 走同一程式碼路徑卻正常工作。現已從 plugin 配置、根目錄 `.mcp.json` 及所有安裝指令碼中刪除該 env var，MCP 現在正確回退到讀取 `api_port.txt` 動態發現埠。使用者手動設定的 `AITEAM_API_URL` 仍具最高優先順序（用於遠端 API 場景）。

## [1.3.1] — 2026-04-13

### 修復
- **Hotfix: context_tracker 1M context window 檢測** — transcript 中 model 欄位為 `claude-opus-4-6`（無 `[1m]` 字尾），導致 1M context session 被誤判為 200K，出現 342% 等異常百分比。新增 token 數量 fallback：若 `used_tokens > 200K`，自動識別為 1M context window。

## [1.3.0] — 2026-04-13

### 新增
- **CC 原生整合（Track A）**
  - `TaskCompleted` hook 硬門控 — `task_completed_gate.py` 在任務缺失 memo/result 時 exit 2 拒絕完成，把 verify_completion 從"軟提示"變"硬攔截"
  - `TaskCreated` hook 橋接 — `cc_task_bridge.py` 把 CC 原生任務自動映象到 OS 任務牆
  - `PermissionDenied` hook 接入分類器 — `permission_denied_recovery.py` 呼叫新 `POST /api/hooks/diagnose_denial` 端點，返回 4 類決策：`recoverable_with_retry` / `recoverable_with_workaround` / `needs_user_approval` / `permanent_denial`
  - 8 個大數據 MCP 工具新增 `meta={"anthropic/maxResultSizeChars": 500000}` 註解（`taskwall_view` / `task_list_project` / `report_list` / `report_read` / `event_list` / `meeting_read_messages` / `memory_search` / `team_knowledge`）
  - `wake_agent` 啟用 `--bare` + `--exclude-dynamic-system-prompt-sections` 最佳化，預期啟動延遲降 50%；長 prompt 走臨時檔案 fallback 繞過 Windows 命令列長度限制

- **會議系統完整重設計（Track B）**
  - `meeting_create` 返回完整 `dispatch_plan[]` — 每個參與者帶 ready-to-paste 的 `Agent()` 啟動引數，徹底消除 Leader 代打問題
  - 結構化 `participants` 輸入：`{name, agent_template, role, context_files, expected_output}` 替代舊字串列表（向後相容）
  - `meeting_attendance_check(meeting_id)` — 查詢當前輪次已發言/未發言參與者 + 超時跟蹤
  - `meeting_send_message` 新增 `caller_agent_id` 引數 — 代打審計，呼叫者與 agent_id 不一致時打 `impersonation: true` 後設資料並記錄事件日誌
  - `meeting_conclude` 預設 `validate_attendance: true` — 未全員發言返回 400 + missing 清單；`force=true` 繞過但記錄 `meeting.forced_conclude_with_missing` 事件
  - `Meeting.meta_json` 持久化欄位儲存 `expected_participants` 和輪次狀態

- **會議模板遷移到 Plugin Skills（Track C）**
  - 8 個模板從硬編碼 `templates.py` dict（234 行）遷移到 `plugin/skills/meeting-facilitate/templates/*.md` 檔案（brainstorm/decision/review/retrospective/standup/debate/lean_coffee/council）
  - 每個模板含 YAML frontmatter 結構化輪次資料 + markdown 正文（何時使用 / 參與者建議 / 反模式）
  - `templates.py` 重寫為懶載入 YAML loader（107 行），保持 API 向後相容
  - **使用者可擴充套件**：drop 一個 `.md` 檔案即可新增自定義會議模板，無需改 Python 程式碼
  - 利用 CC 的 progressive disclosure 模式 — 模板僅在需要時載入，零 token 消耗
  - 完全重寫 `plugin/skills/meeting-facilitate/SKILL.md`（355 行）：7 步生命週期對接新 dispatch_plan API + 模板選擇決策矩陣 + 3 個端到端場景 + 7 條反模式警告

- **上下文追蹤改為 transcript 直讀（Plan E）**
  - 新增 `context_tracker.py` hook 註冊到 `UserPromptSubmit` — 從 hook payload 讀 `transcript_path`，解析 session jsonl 最後一條 assistant message 的 `usage.input_tokens` + cache tokens，獲得 100% 精確的上下文使用率
  - 自動識別 1M 上下文視窗（通過 model 識別符號 `[1m]` 字尾）
  - `>=80%` 觸發 CONTEXT WARNING，`>=90%` 觸發 CONTEXT CRITICAL，帶 token 明細
  - **完全不依賴 statusline** — 分發版使用者無需安裝自定義 statusline 也能工作
  - **天然專案隔離** — transcript path 本身就編碼了專案身份，徹底消除跨專案 monitor 檔案 bug

- **專案自動註冊流程**
  - 新增 `POST /api/context/resolve` 端點，支援精確匹配/字首匹配/自動建立三種策略
  - `session_bootstrap.py` 檢測未註冊目錄並注入註冊詢問提示給 Leader（非阻塞）
  - 新增 `dismiss_project_registration(cwd)` MCP 工具 — 使用者可拒絕註冊；持久化到 `~/.claude/data/ai-team-os/dismissed_projects.json`
  - 修復新專案目錄（如 `靖安筆試`、`repo-insight`）必須手動觸發才能註冊的 bug

### 變更
- **任務牆自動同步（`workflow_reminder.py`）**
  - PreToolUse：提取 agent prompt + description，與專案任務牆 pending 項做關鍵詞匹配，Leader 派遣未匹配牆上任務時發出警告
  - PostToolUse：新增 `_post_tool_taskwall_sync()` — Agent 派遣時自動更新匹配任務為 `running`；完成 SendMessage 時自動更新為 `completed`
  - 報告資料目錄警告精確到 `.claude/data/ai-team-os/reports/` 路徑，不再對原始碼誤報

- **會話啟動上下文工程**
  - 移除損壞的"讀取 `~/.claude/context-monitor.json`"指令（檔案已不再維護）
  - 新指令：hook 已自動監控上下文，Leader 只需專注任務推進
  - 未註冊目錄檢測到時注入專案自動註冊提示塊

- **文件更新**
  - `README.md` / `README.zh-CN.md` 反映新會議系統和模板架構
  - Skill 文件按 CC progressive disclosure 最佳實踐重組

### 修復
- **分發版同步** — 4 個 hook 指令碼在 `src/aiteam/hooks/` 和 `plugin/hooks/` 之間失同步（缺失 `_get_api_url()`、專案註冊檢查、任務牆自動同步邏輯）。分發版使用者會遭遇動態埠失效和功能靜默缺失。所有 4 個檔案現在在 dev 和分發副本之間位元組級一致。
- **`meeting.py:103`** — `_build_dispatch_plan` 返回型別註解對齊實際三元組（補上 `legacy_warnings`）
- **`context-monitor.json` 跨專案汙染** — 舊 `_find_monitor_file()` 用 glob 掃所有專案按 mtime 取最新，會讀到其他 session 的過期資料。已被 `context_tracker.py` 完全替代，後者用 `transcript_path.parent` 天然隔離
- **定時喚醒誤報** — 自動喚醒 prompt 不再讀取 9 天前的全域性 `context-monitor.json`（它錯誤地總是報告 <10% 無論實際用量如何）

### 移除
- `src/aiteam/hooks/context_monitor.py` 和 `plugin/hooks/context_monitor.py` — 被 `context_tracker.py` 取代
- 全域性 `~/.claude/context-monitor.json` 依賴 — OS 不再讀也不再寫

## [1.2.1] — 2026-04-07

### 新增
- **報告系統資料庫遷移** — 報告從檔案系統遷入 SQLite 資料庫，消除檔案許可權問題並支援專案隔離
- **ReportModel ORM** — 新增 `reports` 表，包含 `project_id`、`author`、`topic`、`report_type`、`content` 欄位
- **報告 REST API** — `POST/GET/DELETE /api/reports`，支援 `project_id`、`report_type`、`author` 查詢過濾
- **Dashboard 全頁面專案隔離** — 全部 9 個 Dashboard 頁面均有專案選擇器：
  - 報告：專案選擇器 + 作者過濾
  - 事件日誌 & 失敗分析：events API 新增 project_id 引數
  - 會議室 & Agent 看板：前端按 team.project_id 過濾
  - 活動分析 & Pipeline：專案→團隊聯動選擇器
- **任務牆自動同步** — workflow_reminder 新增 `_post_tool_taskwall_sync()`：Agent 派遣自動關聯任務牆項並更新狀態（pending→running→completed）
- **PreToolUse 任務牆匹配** — Agent prompt 與專案任務牆的關鍵詞重疊檢查，未在牆上的工作會收到警告
- **專案級聯刪除** — `delete_project()` 清理 11 張關聯表：meetings、meeting_messages、tasks、agents、teams、phases、reports、briefings、memories、events、cross_messages

### 變更
- **`report_save` MCP 工具** — 改為呼叫 `POST /api/reports` 存入資料庫，不再直接寫檔案，無需檔案系統許可權
- **`report_list` MCP 工具** — 改為呼叫 `GET /api/reports`，支援服務端過濾（report_type、author、topic）
- **`report_read` MCP 工具** — 改為通過報告 ID 從資料庫讀取，不再按檔名讀取
- **Events API** — `list_events` 端點接受 `project_id` 查詢引數，按專案所屬團隊 ID 過濾
- **子 Agent 上下文注入** — 加強 report_save 指令："報告必須通過 report_save 工具儲存到資料庫（直接 Write 不會被系統追蹤）"
- **Workflow reminder 報告檢測** — 路徑匹配精確到 `.claude/data/ai-team-os/reports/` 資料目錄，不再對包含"reports"的原始碼檔案誤報
- **i18n** — 中英文新增 `allProjects`、`filterType`、`types.*` 翻譯鍵

### 修復
- `app.py` — `_dist_dir` 為 None 時崩潰（無 dashboard dist 目錄場景）
- `test_version_flag` — 版本斷言從 `0.8.0` 更新為 `1.2.0`
- `test_teamcreate_reminds_task` — 放寬 warning 數量斷言為 `>= 1`（適配新增的活躍團隊提醒）
- 報告頁面無法切換分類和讀取報告 — 使用資料庫後端完全重寫
- 155 份舊檔案系統報告通過 `scripts/migrate_reports.py` 遷入資料庫

## [1.2.0] — 2026-04-05

### 新增
- **Agent 看門狗心跳系統** — `agent_heartbeat` / `watchdog_check` MCP 工具，5 分鐘 TTL 超時檢測，自動識別卡死的 Agent
- **SRE 錯誤預算模型** — 綠色/黃色/橙色/紅色四級響應，20 任務滑動視窗，`error_budget_status` / `error_budget_update` 工具
- **完成驗證協議** — `verify_completion` 檢查任務狀態與備忘錄是否存在，防止幻覺完成報告
- **Alembic 增量遷移** — v1.1 完整 schema 遷移檔案（trust_score / channel_messages / entity_id / state_snapshot 等）
- **生態整合配方文件** — GitHub / Slack / Linear / 全棧團隊 4 個預設配方（`docs/ecosystem-recipes.md`）
- **`ecosystem_recipes()` MCP 工具** — 整合配方發現與查詢
- **MCP 除錯日誌增強** — 啟動鎖機制日誌，API 啟動過程可追蹤
- **自動埠發現** — API 伺服器自動尋找空閒埠，避免多專案衝突；埠寫入 `api_port.txt` 共享
- **MCP HTTP Streamable 端點** — `/mcp/` 掛載到 FastAPI（附加能力，CC 連線保持 stdio）
- **INSTALL.md** — CC 輔助安裝指引，含 venv 檢測邏輯
- **PyPI 1.2.0 釋出** — `pip install ai-team-os` 可獲取最新版

### 變更
- **會話啟動上下文工程** — 規則從 23 條精簡為 5 條核心規則（上下文注入量減少 60%）
- **子 Agent 上下文注入** — 新增 60 行上限裁剪，按優先順序自動丟棄低優先內容
- **`_ensure_api_running` 原子啟動鎖** — 防止多會話埠競爭（`O_CREAT|O_EXCL` 檔案鎖）
- **Hooks 動態讀取 API 埠** — 從 `api_port.txt` 讀取埠，不再硬編碼 8000
- **`__init__.py` 版本同步為 1.2.0**
- **`pyproject.toml` 後設資料** — 新增 classifiers、keywords 和專案 URLs

### 修復
- Alembic 整合後 `_run_migrations` 被跳過 — 改為始終執行（冪等安全）
- 多個 CC 會話同時啟動 API 導致埠衝突 — 使用原子檔案鎖解決
- StateReaper 級聯關閉活躍會議時誤關有近期訊息的會議 — 增加近期訊息檢查
- `_read_pid_file` 在 Windows 上丟擲 `SystemError` — 增加異常捕獲
- `install.py` 使用 `sys.executable` 絕對路徑 — 解決專案 venv 劫持 hooks/MCP 問題
- `auto_install.py` 改為從 GitHub 安裝 — PyPI 版本滯後時仍能獲取最新程式碼
- 啟動鎖 60 秒 TTL — 防止 CC 異常退出後鎖檔案殘留阻塞啟動
- MCP HTTP 掛載修復 — lifespan 傳遞 + `path='/'` 路由 + 308 重定向處理
- Plugin marketplace 15 個安裝 bug 修復 — hooks 改為 `${CLAUDE_PLUGIN_ROOT}` 路徑 + 恢復 `.py` 指令碼

## [1.1.0] — 2026-04-05

### 新增
- **Agent 信任評分系統** — `trust_score` 欄位（0-1），任務成功/失敗自動調整，`auto_assign` 加權匹配，`agent_trust_scores` / `agent_trust_update` MCP 工具
- **語義快取層** — BM25 + Jaccard 相似度匹配，JSON 持久化，TTL 過期機制，`cache_stats` / `cache_clear` MCP 工具
- **工具分級定義** — 核心工具（15 個必備）與高階工具（46 個領域專用）分類，為未來上下文預算最佳化做準備

### 變更
- `TaskModel.status` 新增資料庫索引（提升查詢效能）
- `resolve_task_dependencies` 改用批次 IN 查詢替換逐條查詢（N+1 最佳化）
- `detect_dependency_cycle` 改為廣度優先搜尋 + 批次查詢（大規模依賴圖效能最佳化）
- `task_list_project` 分頁 — 新增 `limit` / `offset` / `include_completed` / `status` 引數

### 修復
- `trust.py` 錯誤響應改為 `HTTPException`（此前返回裸字典）
- `git_ops.py` 敏感檔案過濾改用 `basename`（避免路徑包含關鍵字時誤攔）
- `channels.py` 死程式碼清理
- 修復已存在的 `test_check_for_updates_no_git_repo_silent` 測試

## [1.0.0] — 2026-04-05

### 新增
- **錯誤型別到恢復策略對映** — `_api_call` 統一附加 `_recovery` 和 `_error_category`，自動推薦恢復動作
- **檔案鎖 / 工作區隔離** — `file_lock_acquire` / `release` / `check` / `list` 4 個 MCP 工具 + TTL=300 秒 + hook 警告，防止併發編輯衝突
- **頻道通訊系統** — `team:` / `project:` / `global` 三種頻道格式 + `@mention` 支援，`channel_send` / `channel_read` / `channel_mentions` MCP 工具
- **執行模式記憶** — 成功/失敗模式記錄 + BM25 檢索 + 子 Agent 上下文注入，`pattern_record` / `pattern_search` MCP 工具
- **Git 自動化工具** — `git_auto_commit` / `git_create_pr` / `git_status_check` MCP 工具，自動過濾敏感檔案
- **Guardrails 一級防護** — 7 種危險模式檢測 + 個人資訊警告 + `InputGuardrailMiddleware`，防止無監督執行時的破壞性操作
- **Alembic 資料庫遷移系統** — 初始修訂版本 + 雙路徑初始化（全新/已有資料庫），遷移歷史可追蹤
- **MCP 除錯日誌系統** — `~/.claude/data/ai-team-os/mcp-debug.log`，工具呼叫鏈路可觀測

### 變更
- **陷阱工具消除** — `team_create` / `agent_register` 描述首行新增警告 + `_warning` 返回值，防止誤用
- **`task_id` 自動注入** — 子 Agent 上下文自動攜帶當前 task_id，無需手動傳遞
- **增強任務分配** — `auto_assign` 加入 `completion_rate` + `trust_score` 加權，優先分配可靠 Agent
- **`inject_subagent_context` 環境變數統一** — 統一為 `AITEAM_API_URL`

### 修復
- `context_monitor` 改為讀取專案級監控檔案（不再讀取過時的全域性檔案）
- 修復已存在的 `test_check_for_updates_no_git_repo_silent` 測試

### 測試
- 28 個跨功能整合測試
- 總測試數：769（從 389 增長）

## [0.9.0] — 2026-04-04

### 新增
- **Prompt Registry（提示詞登錄檔）** — Agent 模板版本追蹤 + 效果統計，3 個 API 端點 + `prompt_version_list` / `prompt_effectiveness` MCP 工具，與 `failure_alchemy` 關聯
- **BM25 搜尋升級** — 中文 bigram + 英文分詞替代簡單關鍵詞匹配，搜尋質量提升 3-5 倍，優雅降級（`jieba` 為可選依賴）
- **事件日誌增強** — EventModel 新增 `entity_id` / `entity_type` / `state_snapshot` 三個欄位，自動快照 + 實體過濾
- **辯論模式** — 4 輪結構化辯論（倡導者 -> 批評者 -> 回應 -> 裁判）+ `debate_start` / `debate_code_review` MCP 工具 + 2 個辯論角色模板
- **3 個儀表盤可觀測性頁面** — 流水線視覺化 / 失敗分析 / 提示詞登錄檔
- **Agent 模板自動安裝** — `install.py` 自動安裝到 `~/.claude/agents/`（預設 opus 模型）
- **CC Marketplace 提交** — 正式提交到 Anthropic 官方外掛市場

### 變更
- **server.py 模組化拆分** — 3050 行單檔案拆分為 57 行入口 + 14 個工具模組 + 2 個基礎模組，可維護性大幅提升
- **會話啟動最佳化** — 從 15-25 秒縮短至 1-2 秒：並行化 + 非同步 git 檢查 + 減少重試次數
- **workflow_reminder 專案隔離** — 所有 API 呼叫新增 `X-Project-Id` 請求頭
- **install.py 重構** — 支援多 hook 分組/事件、自動設定 `AGENT_TEAMS` 環境變數和 `effortLevel` 推薦配置
- **`_resolve_project_id` 快取** — 5 分鐘 TTL 檔案快取，減少高頻 hook 的 HTTP 呼叫
- **inject_subagent_context 環境變數統一** — `AI_TEAM_OS_API` 更名為 `AITEAM_API_URL`
- **測試匯入路徑遷移** — `plugin/hooks/` 遷移至 `aiteam.hooks` 包匯入

### 修復
- workflow_reminder 專案級任務查詢缺少 `X-Project-Id` 請求頭（B1）
- TeamDelete PUT 請求缺少 `X-Project-Id` 請求頭（B2）
- 測試檔案匯入路徑斷裂（plugin/hooks 刪除後）
- `context_monitor` 路徑修復 — 改為讀取專案級檔案而非全域性過時檔案
- statusline.py 相關廢棄測試清理

### 移除
- **plugin/hooks/ 死程式碼清理** — 刪除 11 個過時的 `.py` / `.ps1` 檔案，僅保留 `hooks.json` + `README`
- **重複 Agent 模板清理** — 刪除舊版 `meeting-facilitator.md` 和 `tech-lead.md`（從 25 個減至 23 個模板）
- **移除 enforce_model hook** — 保留使用者模型選擇的靈活性
- **從 install.py 移除模型設定** — 不再強制新使用者配置模型

## [0.8.0] — 2026-04-04

### 新增
- **成本追蹤**：AgentActivity 新增 `tokens_input`/`tokens_output`/`cost_usd` 欄位，`GET /api/analytics/token-costs` 介面，`token_costs` MCP 工具
- **執行追蹤**：`GET /api/tasks/{id}/execution-trace` 統一時間線（事件 + 備忘錄），`task_execution_trace` MCP 工具
- **Agent 即時面板**：`AgentLivePage` 儀表盤，狀態標籤（忙碌/等待/離線），30 秒自動重新整理
- **故障自動診斷**：`FailureAlchemist.diagnose_failure()`，`POST /api/tasks/{id}/diagnose`，`diagnose_task_failure` MCP 工具
- **Slack/Webhook 通知**：`NotificationService`，EventBus 自動觸發，`GET/PUT/DELETE /api/settings/webhook`，`send_notification` MCP 工具
- **流水線並行執行**：`parallel_with` 欄位，完成門控，4 個新增並行測試（共 28 個）
- **執行回放引擎**：`ReplayEngine`（get_replay + compare_executions），`task_replay`/`task_compare` MCP 工具
- **成本預算與告警**：每週預算限額（預設 50 美元），80% 告警閾值，`GET /api/analytics/budget`，`budget_status` MCP 工具
- **Leader 簡報頁面**：雙層標籤頁（專案 + 狀態），專案名稱標籤，解決/忽略操作介面
- **79 個 MCP 工具**（原為 72 個）

### 修復
- **P0 API 程序管理**：PID 檔案替換檔案鎖，`_is_api_healthy()` 替換 `_is_port_open()`，卡死程序 15 秒自動終止
- **全域性專案隔離**：`Repository._apply_project_filter()`，MCP 自動注入 `X-Project-Id` 請求頭
- **會話啟動**：使用工作目錄匹配的專案（不再使用 `projects[0]`）
- **簡報列表隔離**：使用限定範圍的倉儲
- **上下文監控**：按專案隔離檔案（不再跨會話覆蓋）

### 變更
- **Hook 指令碼**：改用 `python -m aiteam.hooks.*` 模組呼叫方式（不再使用檔案路徑）
- **外掛 hooks.json + .mcp.json**：統一為 python -m 命令
- **install.py**：基於模組的 hook，`~/.mcp.json` 用於跨專案 MCP

## [0.7.2] — 2026-04-02

### 新增
- **MCP 工具**：`project_update`、`project_delete`、`project_summary`、`task_subtasks`、`team_delete`、`briefing_dismiss`（共 72 個）
- **儀表盤專案改版**：狀態標籤（活躍/非活躍），可展開的詳情行，喚醒設定標籤頁
- **專案摘要 API**：`GET /api/projects/{id}/summary` — 快速狀態 + 優先任務

### 變更
- **專案隔離重新設計**：移除按專案分庫方案（死程式碼，減少 180 行），統一 `context_resolve()` 使用程序級快取
- **SQLite WAL 模式**：通過引擎事件監聽器啟用，支援多會話併發
- **停用自動專案註冊**：SessionStart 不再自動建立專案，提示使用者通過 `project_create` 手動註冊
- **context_resolve()**：移除危險的 `projects[0]` 回退策略，無匹配時返回空值

### 修復
- 多會話資料庫鎖：SQLite `journal_mode=WAL` + `busy_timeout=10s` 防止併發寫入失敗
- 資料回填：272 個孤立 Agent、57 個任務、72 個會議分配到正確專案
- 垃圾專案清理：移除 6 個自動建立的專案，去重量化專案
- 儀表盤 `ProjectSwitcher` 下拉框移除（原先會跳轉到空白頁）
- 喚醒 Agent `--output-format stream-json` 錯誤移除（與 `-p` 標誌不相容）
- 喚醒熔斷器：僅統計真實失敗（錯誤/超時），不統計跳過

## [0.7.1] — 2026-04-02

### 新增
- **Leader 簡報系統** — 自主執行時的決策上報機制
  - 資料庫表 `leader_briefings` + Pydantic 模型 + ORM
  - 3 個 MCP 工具：`briefing_add`、`briefing_list`、`briefing_resolve`
  - API 端點：GET/POST `/api/leader-briefings`，PUT `/{id}/resolve`，PUT `/{id}/dismiss`
  - Leader 在自主工作期間記錄待決事項，使用者返回後統一審閱
- **通過 CronCreate 自動喚醒** — SessionStart 啟動時注入 CronCreate 指令
  - 每 3 分鐘 Leader 自動檢查任務牆並推進工作
  - 通過 `briefing_add` 上報決策，使用者返回時彙報待處理事項
- **install.py** — 一鍵安裝 hook、MCP 和驗證
  - `python scripts/install.py` — 完整安裝（hook + MCP + settings.json）
  - `python scripts/install.py --check` — 驗證 9 個 hook、MCP、API、包
  - `python scripts/install.py --uninstall` — 移除配置，保留資料

## [0.7.0] — 2026-04-02

### 新增
- **喚醒 Agent 排程器** — 通過 `claude -p` 子程序自動喚醒 Agent
  - WakeAgentManager：子程序生命週期管理（communicate + 兩階段終止）
  - WakeSession 資料模型 + ORM + 7 個倉儲 CRUD 方法
  - 7 層安全機制：陣列引數、UUID 驗證、按 Agent 加鎖、全域性訊號量（最大=2）、熔斷器、提示/資料 XML 分離、環境變數清理
  - 分診預檢：無可執行任務時跳過喚醒（約 70% 跳過率）
  - 緊急停止 API：`PUT /wake-pause-all`、`PUT /wake-resume-all`
  - StateReaper 整合（即發即忘 + 優雅關閉）
  - allowedTools 預設：安全模式（無 Bash）/ 含 Bash 模式（顯式啟用）
- **CronCreate 會話喚醒** — 驗證 CC 內建定時任務用於喚醒當前會話
- 20 個 wake_manager 單元測試（全部通過）
- 喚醒會話結果追蹤（已完成/超時/錯誤/熔斷/分診跳過）

### 修復
- `context_resolve()` 自動專案選擇：通過工作目錄匹配 root_path，不再盲目選擇第一個專案
- Hook 路徑編碼：將 hook 指令碼移至 ASCII 路徑（`~/.claude/plugins/ai-team-os/hooks/`）
- Hook 豁免列表：將 claude-code-guide、tdd-guide、refactor-cleaner 新增到非阻塞 Agent 型別
- 排程器路由中 `valid_actions` 缺少 "wake_agent"（導致無法建立 API）
- 訊號量私有 API 訪問（`_value`）替換為 `locked()`
- 熔斷器：僅統計真實失敗（錯誤/超時），不統計跳過
- `duration_seconds` 現已正確計算並記錄
- `shutdown()` 字典迭代安全（取消前先快照值）
- 全域性 MCP 配置：新增 `cwd` 欄位以支援跨目錄使用
- 資料遷移：將 19 個任務 + 1 個團隊從錯誤專案移至正確專案

### 變更
- `_clean_env()` 從白名單策略改為黑名單策略（繼承全部，排除金鑰）
- 外掛清單：新增 `hooks` 欄位指向 `hooks/hooks.json`
- 外掛 `.mcp.json`：本地開發模式使用 `python -m aiteam.mcp.server` 並指定 `cwd`

## [0.6.0] — 2026-03-22

### 新增
- 工作流編排流水線（7 個模板，自動階段推進）
- 流水線強制執行：task_type 引數 + 逐步阻塞
- 跨專案訊息系統（v1，單機版）
- 自動更新機制（scripts/update.py）
- 團隊清理提醒（SessionStart + 規則 15）
- 獨立安裝方式（hook 複製到 ~/.claude/hooks/）
- CC 外掛包結構
- 解除安裝指令碼（scripts/uninstall.py）
- 儀表盤：活動表格 + 決策時間線增強

### 修復
- 全域性 MCP 配置：使用 ~/.claude.json（而非 settings.json）
- 安裝依賴（fastapi、uvicorn、fastmcp 改為必需依賴）
- SessionStart API 重試（針對時序問題重試 3 次）
- B0.9 噪音降低（首次提醒後每 10 次呼叫提醒一次）
- Windows UTF-8 編碼修復（所有 hook 指令碼）

## [0.5.0] — 2026-03-22

### 新增
- 跨專案訊息系統（2 個 MCP 工具 + 4 個 API 端點 + 全域性資料庫）
- 自動更新機制（scripts/update.py + install.py --update）
- SessionStart 24 小時冷卻更新檢查
- 獨立安裝：hook 複製到 ~/.claude/hooks/ai-team-os/
- 全域性 MCP 註冊到 ~/.claude/settings.json

### 變更
- 安裝步驟縮減為 3 步（API 隨 MCP 自動啟動，無需手動啟動）

## [0.4.0] — 2026-03-21

### 新增
- 按專案資料庫隔離（階段 1-4）
- EnginePool 帶 LRU 快取的多資料庫管理
- ProjectContextMiddleware（X-Project-Dir 請求頭路由）
- 遷移指令碼：按 project_id 拆分全域性資料庫
- StateReaper + 看門狗多資料庫適配
- 儀表盤專案切換器
- install.py：完整入門流程（hook + Agent + MCP + 驗證）
- GET /api/health 健康檢查端點

### 修復
- Windows UTF-8 編碼修復（所有 hook 指令碼從 gbk 轉為 utf-8）
- 團隊模板引用實際的 Agent 模板名稱

## [0.3.0] — 2026-03-21

### 新增
- 工作流強制執行：規則 2 任務牆檢查 + 模板提醒
- 本地 Agent 阻塞（B0.4）：所有非只讀 Agent 必須有 team_name
- Council 會議模板（3 輪多視角專家評審）
- 會議自動選擇：跨 8 個模板的關鍵詞匹配
- 團隊關閉時級聯關閉會議
- find_skill MCP 工具，3 層漸進式載入
- task_update MCP 工具 + PUT /api/tasks/{id}
- 6 個新增 MCP 工具（共 55 個）
- 467+ 個測試

### 修復
- S1 安全正則捕獲大寫 -R 標誌
- S1 heredoc 誤報
- 規則 7 任務牆計時器初始化
- 會議過期時間從 2 小時調整為 45 分鐘
- B0.9 基礎設施工具豁免於委派計數器

## [0.2.0] — 2026-03-20

### 新增
- LoopEngine 與 AWARE 迴圈
- 任務牆（評分排序 + 看板檢視）
- 排程器系統（週期性任務）
- React 儀表盤（6 個頁面）
- 會議系統（7 個模板）
- 26 個 Agent 模板，覆蓋 7 個類別
- 失敗鍊金術（抗體 + 疫苗 + 催化劑）
- 假設分析
- 國際化支援（中文/英文）
- 研發監控系統（10 個資訊源）

## [0.1.0] — 2026-03-12

### 新增
- MCP 伺服器 + FastAPI 後端
- CC Hooks 整合（7 個生命週期事件）
- 團隊/Agent/任務/專案管理
- SQLite 儲存 + 非同步倉儲
- 會話啟動時行為規則注入
- 事件匯流排 + 決策日誌
- 記憶搜尋
