# AI Team OS — 開發協調

## 當前階段: Milestone 2 — 視覺化管理

## M1 回顧: ✅ 已完成併發布
- commit bee43d8, 78/78測試通過, CP1-CP5全部驗證
- 已push到 GitHub master

## M2 架構決策（5專家調研確認）
- PostgreSQL 16 + pgvector + Redis 7 via Docker
- FastAPI + WebSocket頻道訂閱
- Vite + React 19 + React Router v7 + Zustand + TanStack Query + shadcn/ui
- Mem0 SDK直連PG+pgvector（非獨立服務）
- 雙後端共存（SQLite預設 / PostgreSQL可選）

## M2 任務進度

| 任務 | 負責人 | 狀態 |
|------|--------|------|
| T1 Docker+PostgreSQL+Redis基礎設施 | storage-engineer | 🔵 進行中 |
| T2 記憶系統重構(MemoryBackend Protocol) | memory-engineer | ⏳ 待開始 |
| T3 Broadcast編排模式 | graph-engineer | 🔵 進行中 |
| T4 FastAPI+WebSocket API層 | api-engineer | ⏳ 待開始 |
| T5 Dashboard骨架(Vite+React+shadcn) | frontend-engineer | ⏳ 待開始 |
| T6 Dashboard: 總覽+團隊頁 | frontend-engineer | ⏳ 待開始 |
| T7 Dashboard: 任務看板+事件日誌 | frontend-engineer-2 | ⏳ 待開始 |
| T8 Dashboard: 設定頁 | frontend-engineer | ⏳ 待開始 |
| T9 Human-in-the-Loop審批節點 | graph-engineer | ⏳ 待開始 |
| T10 整合測試+CI | qa-engineer | ⏳ 待開始 |

## Phase執行計劃
```
Phase 1 (當前): T1 + T3 並行
Phase 2:        T2 + T4 並行 (依賴T1)
Phase 3:        T5 (依賴T4)
Phase 4:        T6 + T7 並行 (依賴T5)
Phase 5:        T8 + T9 + T10
```
