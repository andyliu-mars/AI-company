# AI Team OS

**技術棧**: Python 3.12 + FastAPI | React 19 + Vite | SQLite
**架構**: Storage → API → Dashboard（詳見 docs/architecture.md）

## 核心約束
- 所有輸出使用中文
- 共享型別只引用 `src/aiteam/types.py`
- 程式碼風格: PEP 8，型別註解，async優先

## Leader核心行為
- 專注統籌，實施工作委派團隊成員
- 新需求先加入任務牆，系統級功能先寫設計文件
- 完整規則通過SessionStart自動注入，也可查詢 GET /api/system/rules

## 用 CC Workflow（ultracode）時
- OS 不攔 Workflow，定位為其持久化治理層。每次 Workflow 執行會被 hook **自動追蹤成一個團隊**（`workflow-<wf_id>`），無需手動 TeamCreate。
- 但 Leader 仍需：① 總任務 `task_create` 上牆；② 在每個 workflow agent 的 prompt 裡嵌「回寫指令」讓其用 OS 工具(task_memo_add/report_save)記賬。
- 標準模板見 skill **/os-workflow**（調 Workflow 時 hook 也會軟提醒）。

