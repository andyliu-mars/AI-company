# AI Team OS

**技术栈**: Python 3.12 + FastAPI | React 19 + Vite | SQLite
**架构**: Storage → API → Dashboard（详见 docs/architecture.md）

## 核心约束
- 所有输出使用中文
- 共享类型只引用 `src/aiteam/types.py`
- 代码风格: PEP 8，类型注解，async优先

## Leader核心行为
- 专注统筹，实施工作委派团队成员
- 新需求先加入任务墙，系统级功能先写设计文档
- 完整规则通过SessionStart自动注入，也可查询 GET /api/system/rules

## 用 CC Workflow（ultracode）时
- OS 不拦 Workflow，定位为其持久化治理层。每次 Workflow 运行会被 hook **自动追踪成一个团队**（`workflow-<wf_id>`），无需手动 TeamCreate。
- 但 Leader 仍需：① 总任务 `task_create` 上墙；② 在每个 workflow agent 的 prompt 里嵌「回写指令」让其用 OS 工具(task_memo_add/report_save)记账。
- 标准模板见 skill **/os-workflow**（调 Workflow 时 hook 也会软提醒）。

