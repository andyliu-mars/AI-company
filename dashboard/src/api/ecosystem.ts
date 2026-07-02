import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

// 與後端 /api/ecosystem/profiles 返回格式對齊
export interface EcosystemRepoProfile {
  id: string;
  repo_full_name: string;
  name: string;
  owner: string;
  description: string | null;
  stars: number;
  language: string | null;
  topics: string[];
  homepage: string | null;
  last_commit_at: string | null;
  needs_deep_review: boolean;
  /** @deprecated v1.6.1: relevance_category 啟發式分類已棄用，後端不再返回 */
  relevance_category?: string | null;
  /** @deprecated v1.6.1: relevance_score 硬編碼評分無參考價值，後端不再返回 */
  relevance_score?: number;
  one_line_summary: string | null;
  last_scanned_at: string;
  first_seen_at: string;
  // Stage B 擴充套件欄位（v2 API 返回時填充）
  pushed_at?: string | null;
  is_archived?: boolean;
  scan_run_id?: string | null;
  description_excerpt?: string;
  // v1.5.0-A 擴充套件欄位（前端 stage 徽章 / failed 提示 / 活躍集 tab 依賴）
  shallow_summary?: string;
  last_shallow_refreshed_at?: string | null;
  is_deleted?: boolean;
  is_private_now?: boolean;
  last_fetch_error?: string;
  fetch_failure_count?: number;
  /** @deprecated v1.6.0 P1.A: 使用 last_active_status 替代（'active' / 'archived' / 'manual_archived' / 'pinned'） */
  is_active?: boolean;
  /** @deprecated v1.6.0 P1.A: 排名機制已廢棄，使用 last_active_status + manual_status 表達活躍度 */
  active_rank?: number | null;
  // v1.5.1：透出漸進漏斗 stage 狀態（取自 latest deep_review，無 review = "queued"）
  stage_status?: string | null;
  // v1.5.1：研究次數（關聯的 deep_review 行數，0 = 未深掃）
  research_count?: number;
  // v1.6.0：last_active_status — 'active' / 'archived' / 'manual_archived' / 'pinned' / null
  last_active_status?: string | null;
  // v1.6.1 多源：sources 列表 + primary_source
  sources?: { kind: string; id: string; url: string; [k: string]: unknown }[];
  primary_source?: string;
  canonical_id?: string | null;
  source_kind?: string;
}

// v1.5.0 漏斗 stage 狀態
export const ECOSYSTEM_STAGE_STATUSES = [
  'queued',
  'shallow_done',
  'shallow_failed',
  'architecture_done',
  'architecture_failed',
  'debated',
  'debated_failed',
  'referenced',
  'integrated',
] as const;

export type EcosystemStageStatus = (typeof ECOSYSTEM_STAGE_STATUSES)[number];

/** stage 中文標籤 */
export const STAGE_STATUS_LABELS: Record<EcosystemStageStatus, string> = {
  queued: '待淺掃',
  shallow_done: '淺掃完成',
  shallow_failed: '淺掃失敗',
  architecture_done: '架構已分析',
  architecture_failed: '架構失敗',
  debated: '已辯論',
  debated_failed: '辯論失敗',
  referenced: '✓ 參考',
  integrated: '★ 已整合',
};

/** stage 顏色（與設計稿 §8.1 對齊：灰/藍/黃/橙/綠/紫/紅） */
export const STAGE_STATUS_TONE: Record<
  EcosystemStageStatus,
  'gray' | 'blue' | 'yellow' | 'orange' | 'green' | 'purple' | 'red'
> = {
  queued: 'gray',
  shallow_done: 'blue',
  shallow_failed: 'red',
  architecture_done: 'yellow',
  architecture_failed: 'red',
  debated: 'orange',
  debated_failed: 'red',
  referenced: 'green',
  integrated: 'purple',
};

/** stage 徽章 className（Tailwind 同構色） */
export function stageBadgeClass(stage: EcosystemStageStatus | string): string {
  const tone = STAGE_STATUS_TONE[stage as EcosystemStageStatus] ?? 'gray';
  switch (tone) {
    case 'gray':
      return 'bg-muted text-muted-foreground border-border';
    case 'blue':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30';
    case 'yellow':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
    case 'orange':
      return 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30';
    case 'green':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    case 'purple':
      return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30';
    case 'red':
      return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export interface EcosystemFacetCounts {
  category: Record<string, number>;
  language: Record<string, number>;
  archived: Record<string, number>; // {"true": n, "false": n}
  // v1.5.1：漸進漏斗 stage 分佈（不被 limit 截斷的全量統計）
  // 例如：{"queued": 162, "shallow_done": 100, "debated": 3}
  stage?: Record<string, number>;
  // v1.6.0 SST: GitHub topics 維度全量統計（取代基於啟發式的 category）
  // 例如：{"mcp": 120, "claude-code": 80, "ai": 75, ...}
  topics?: Record<string, number>;
}

export interface EcosystemProfilesResponse {
  profiles: EcosystemRepoProfile[];
  total: number;
  limit?: number;
  offset?: number;
  has_more?: boolean;
  facet_counts?: EcosystemFacetCounts;
}

export interface EcosystemFilters {
  keyword?: string;
  topic?: string;
  /** @deprecated v1.6.0: relevance_category 啟發式分類已廢棄，UI 改用 topics 多選篩選 */
  category?: string;
  /** v1.6.0: GitHub topics 多選篩選（客戶端 filter；與 profile.topics 求交集） */
  topics?: string[];
  minStars?: number;
  maxStars?: number;
  needsDeepReview?: boolean | null;
  limit?: number;
  offset?: number;
  facetCounts?: boolean;
  // v1.5.0-E 新增：活躍/全量/已刪除 tab + stage 維度篩選
  isActive?: boolean | null;
  isDeleted?: boolean | null;
  stageStatus?: string; // 多個用逗號分隔
}

/**
 * 列表查詢：檢索生態倉檔案。
 * 對接 GET /api/ecosystem/profiles
 */
export function useEcosystemProfiles(filters: EcosystemFilters = {}) {
  const {
    keyword = '',
    topic = '',
    category = '',
    minStars = 0,
    maxStars = 0,
    needsDeepReview = null,
    limit = 100,
    offset = 0,
    facetCounts = false,
    isActive = null,
    isDeleted = null,
    stageStatus = '',
  } = filters;

  const params = new URLSearchParams();
  if (keyword) params.set('keyword', keyword);
  if (topic) params.set('topic', topic);
  if (category) params.set('category', category);
  if (minStars > 0) params.set('min_stars', String(minStars));
  if (maxStars > 0) params.set('max_stars', String(maxStars));
  if (needsDeepReview !== null) params.set('needs_deep_review', String(needsDeepReview));
  params.set('limit', String(limit));
  if (offset > 0) params.set('offset', String(offset));
  if (facetCounts) params.set('facet_counts', 'true');
  if (isActive !== null) params.set('is_active', String(isActive));
  if (isDeleted !== null) params.set('is_deleted', String(isDeleted));
  if (stageStatus) params.set('stage_status', stageStatus);

  return useQuery({
    queryKey: ['ecosystem', 'profiles', filters],
    queryFn: () => apiFetch<EcosystemProfilesResponse>(`/api/ecosystem/profiles?${params.toString()}`),
  });
}

/**
 * 單倉檔案 hook（基礎資訊）— 用於不需要深度檔案的場景。
 * 通過 /profiles 列表回退查詢（保持向後相容）。
 */
export function useEcosystemRepoDetail(repoId: string | null) {
  return useQuery({
    queryKey: ['ecosystem', 'repo', repoId],
    queryFn: async (): Promise<EcosystemRepoProfile | null> => {
      if (!repoId) return null;
      const data = await apiFetch<EcosystemProfilesResponse>(`/api/ecosystem/profiles?limit=100`);
      return data.profiles.find((p) => p.id === repoId) ?? null;
    },
    enabled: !!repoId,
  });
}

// ============================================================
// v2 API: 單倉全息詳情 (BUG-023 修復)
// ============================================================

/** 能力 / 成熟度 / 風險 標籤 */
export interface EcosystemTag {
  tag_id: string;
  name: string;
  category: string; // capability / maturity / risk / ...
  aliases: string[];
  description: string | null;
  confidence: number; // 0-1
  source: string; // github_topic / auto_rule / llm / manual
  agent_id: string | null;
  created_at: string;
}

/** 深掃記錄 */
export interface EcosystemDeepReview {
  id: string;
  repo_id: string;
  status: string; // pending / running / completed / failed
  agent_id: string | null;
  summary_md: string;
  architecture_md: string;
  demo_result: string | null;
  demo_log_excerpt: string | null;
  risks_md: string;
  learnings_md: string;
  integration_recommendation: string | null; // adopt / experiment / hold / avoid
  report_id: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number;
  // v1.5.0-A 欄位（前端 timeline 依賴）
  stage_status?: EcosystemStageStatus | string;
  integration_md?: string;
  shallow_completed_at?: string | null;
  architecture_completed_at?: string | null;
  debated_at?: string | null;
  stage3_completed_at?: string | null;
  debate_meeting_id?: string | null;
  integration_task_id?: string | null;
}

/** 倉與倉的關聯關係 */
export interface EcosystemRelation {
  id: string;
  source_repo_id: string;
  target_repo_id: string;
  source_repo_full_name?: string;
  target_repo_full_name?: string;
  relation_type: string; // depends_on / inspired_by / fork_of / replaces / ...
  confidence: number;
  evidence: string | null;
  created_at: string;
}

/** 掃描執行記錄（與後端 /api/ecosystem/scan-runs 返回對齊） */
export interface EcosystemScanRun {
  id: string;
  agent_id: string | null;
  /** 後端原始欄位（incremental / full / topic / trending 等） */
  strategy: string;
  /** 前端派生：等同 strategy（向後相容 UI 欄位名） */
  scan_type: string;
  started_at: string;
  completed_at: string | null;
  /** 前端派生：completed_at != null → 'completed'，否則 'running'；errors 非空 → 'failed' */
  status: 'completed' | 'running' | 'failed' | string;
  duration_seconds?: number | null;
  repos_added: number;
  repos_updated: number;
  repos_skipped?: number;
  /** v1.6.1 Phase 2: repos with actual metadata changes (topics/stars/desc/lang) */
  metadata_changed_count?: number;
  errors?: string[];
  triggered_by?: string;
  notes: string | null;
}

/** 後端 /api/ecosystem/scan-runs 原始響應（欄位在 hook 中對映） */
interface ScanRunsApiResponse {
  runs: Array<{
    id: string;
    agent_id: string | null;
    strategy: string;
    started_at: string;
    completed_at: string | null;
    duration_seconds?: number | null;
    repos_added: number;
    repos_updated: number;
    repos_skipped?: number;
    metadata_changed_count?: number;
    errors?: string[];
    triggered_by?: string;
    notes: string | null;
  }>;
  total: number;
}

/** v2 全息響應 — 與後端 EcosystemRepoFullResponse 對齊 */
export interface EcosystemRepoFullResponse {
  profile: EcosystemRepoProfile;
  tags: EcosystemTag[];
  deep_reviews: EcosystemDeepReview[];
  relations_from: EcosystemRelation[];
  relations_to: EcosystemRelation[];
  scan_run: EcosystemScanRun | null;
}

/** 深掃列表響應 — 用於統計真實 completed/running/failed 數 */
export interface EcosystemDeepReviewListResponse {
  reviews: EcosystemDeepReview[];
  total: number;
}

/**
 * 列出深掃記錄，可按 status 過濾（completed / running / pending / failed / skipped）。
 * 用於 StatsBar 計算真實"已深掃"數量（語義 = DeepReview.status='completed' 的行數）。
 *
 * 注意：profile.needs_deep_review 欄位語義是"是否需要被深掃"，false 不等於"已完成深掃"。
 * 必須用本介面拉真實 DeepReview 行為準。
 */
/**
 * GET /api/ecosystem/scan-runs?limit=N — 最近 N 次批次掃描記錄（生態檔案級）
 * 用於 EcosystemListPage 頂部展示"最近批次掃描"概覽。
 * 返回按 started_at 倒序，最近一次 = list[0]。
 */
export function useEcosystemRecentScanRuns(limit: number = 5) {
  return useQuery({
    queryKey: ['ecosystem', 'scan-runs', limit],
    queryFn: async (): Promise<{ data: EcosystemScanRun[]; total: number }> => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      const body = await apiFetch<ScanRunsApiResponse>(
        `/api/ecosystem/scan-runs?${params.toString()}`,
      );
      // 後端返回 {runs, total}，前端 hook 歷來期望 {data, total}。
      // 同時派生 scan_type（= strategy）與 status（completed_at + errors 推斷）。
      const data: EcosystemScanRun[] = body.runs.map((r) => {
        const hasErrors = Array.isArray(r.errors) && r.errors.length > 0;
        const status: EcosystemScanRun['status'] = r.completed_at
          ? hasErrors
            ? 'failed'
            : 'completed'
          : 'running';
        return {
          ...r,
          scan_type: r.strategy,
          status,
        };
      });
      return { data, total: body.total };
    },
    staleTime: 30_000,
  });
}

export function useEcosystemDeepReviews(status: string = '') {
  return useQuery({
    queryKey: ['ecosystem', 'deep_reviews', status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      params.set('limit', '100'); // 後端上限 100；當前資料量 < 100 充足
      return apiFetch<EcosystemDeepReviewListResponse>(
        `/api/ecosystem/deep_reviews?${params.toString()}`,
      );
    },
    staleTime: 30_000,
  });
}

/**
 * v2: GET /api/ecosystem/profiles/{repo_full_name:path}/full — 全息詳情
 *
 * 接受 UUID 或 repo_full_name。若傳 UUID，會先在快取的列表裡查詢對應 full_name。
 * 失敗時返回 null（不拋錯），上層降級展示基礎資訊。
 */
export function useEcosystemRepoFull(repoIdOrName: string | null) {
  return useQuery({
    queryKey: ['ecosystem', 'repo-full', repoIdOrName],
    queryFn: async (): Promise<EcosystemRepoFullResponse | null> => {
      if (!repoIdOrName) return null;

      // 判定是 UUID 還是 owner/name
      let repoFullName = repoIdOrName;
      const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        repoIdOrName,
      );
      if (looksLikeUuid) {
        // 後端 limit 上限 200，分頁拉取所有頁直到命中
        const pageSize = 200;
        let offset = 0;
        let hit: EcosystemRepoProfile | undefined;
        // 防禦性兜底：最多 10 頁（2000 倉），避免迴圈
        for (let page = 0; page < 10; page++) {
          const list = await apiFetch<EcosystemProfilesResponse & { offset?: number }>(
            `/api/ecosystem/profiles?limit=${pageSize}&offset=${offset}`,
          );
          hit = list.profiles.find((p) => p.id === repoIdOrName);
          if (hit) break;
          if (list.profiles.length < pageSize) break; // 末頁
          offset += pageSize;
        }
        if (!hit) return null;
        repoFullName = hit.repo_full_name;
      }

      // path 引數包含斜槓：單段 encode 即可（path-converter 接受 /）
      const encoded = repoFullName
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');
      try {
        return await apiFetch<EcosystemRepoFullResponse>(
          `/api/ecosystem/profiles/${encoded}/full`,
        );
      } catch {
        return null;
      }
    },
    enabled: !!repoIdOrName,
    retry: false,
  });
}

/** 評審 status 中文對映 — 通用語義（v1.5.2: "深掃中" → "評審中"，因為 status 不區分淺/深 stage） */
export const DEEP_REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: '待評審',
  running: '評審中',
  completed: '已完成',
  failed: '失敗',
  skipped: '已跳過',
};

/** 整合建議中文對映 */
export const INTEGRATION_RECOMMENDATION_LABELS: Record<string, string> = {
  adopt: '採納',
  experiment: '試驗',
  hold: '觀望',
  avoid: '迴避',
};

/** 關聯關係型別中文對映 */
export const RELATION_TYPE_LABELS: Record<string, string> = {
  depends_on: '依賴',
  inspired_by: '受啟發',
  fork_of: 'Fork 自',
  replaces: '替代',
  similar_to: '相似',
  extends: '擴充套件',
  uses: '使用',
};

/**
 * 類別選項 — 與後端 EcosystemRepoProfile.relevance_category 對齊。
 */
export const RELEVANCE_CATEGORIES = [
  'agent-framework',
  'mcp-server',
  'memory-system',
  'skill-system',
  'tooling',
] as const;

export type RelevanceCategory = (typeof RELEVANCE_CATEGORIES)[number];

/**
 * v1.6.0: Topic badge 動態顏色調色盤 (StatsBar + RepoCard 共享).
 * 按位置 idx % length 迴圈, top N 排名變化時顏色自動跟隨位置.
 * 用低飽和度 (secondary variant 基礎 + 柔和邊框/文字色), 保持簡潔不刺眼.
 */
export const TOPIC_COLOR_PALETTE: readonly string[] = [
  'border-blue-500/30 text-blue-700 dark:text-blue-300',
  'border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
  'border-amber-500/30 text-amber-700 dark:text-amber-300',
  'border-purple-500/30 text-purple-700 dark:text-purple-300',
  'border-rose-500/30 text-rose-700 dark:text-rose-300',
  'border-cyan-500/30 text-cyan-700 dark:text-cyan-300',
  'border-orange-500/30 text-orange-700 dark:text-orange-300',
  'border-pink-500/30 text-pink-700 dark:text-pink-300',
] as const;

/**
 * @deprecated v1.6.0 SST: relevance_category 啟發式分類已廢棄，UI 改用真實 GitHub topics。
 * 此對映保留僅作老資料回顯相容。新程式碼不應使用。
 */
export const CATEGORY_LABELS: Record<string, string> = {
  'agent-framework': 'Agent 框架',
  'mcp-server': 'MCP 伺服器',
  'memory-system': '記憶系統',
  'skill-system': '技能系統',
  tooling: '開發工具',
};

// ============================================================
// v1.5.0-E: Project Settings (決策 12.1)
// ============================================================

/** 專案級 ecosystem 配置 — 與後端 EcosystemProjectSettings 對齊 */
export interface EcosystemProjectSettings {
  project_id: string;
  min_stars: number;
  top_n: number;
  refresh_interval_days: number;
  auto_shallow_on_archive: boolean;
  focus_topics: string[];
  focus_languages: string[];
  shallow_concurrency: number;
  deep_concurrency: number;
  /** v1.6.1 Phase 2: 每次掃描最多允許新增的倉數（超過觸發告警），從 scan_profile 遷移 */
  alert_max_new_per_scan: number;
  created_at: string | null;
  updated_at: string | null;
}

/** 用 PUT 提交時的入參（不帶 timestamps） */
export type EcosystemProjectSettingsInput = Omit<
  EcosystemProjectSettings,
  'project_id' | 'created_at' | 'updated_at'
>;

/** GET /api/ecosystem/projects/{project_id}/settings */
export function useEcosystemProjectSettings(projectId: string | null) {
  return useQuery({
    queryKey: ['ecosystem', 'project-settings', projectId],
    queryFn: () =>
      apiFetch<EcosystemProjectSettings>(
        `/api/ecosystem/projects/${projectId}/settings`,
      ),
    enabled: !!projectId,
  });
}

/** PUT /api/ecosystem/projects/{project_id}/settings */
export function useUpdateProjectSettings(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EcosystemProjectSettingsInput) => {
      if (!projectId) throw new Error('projectId required');
      return await apiFetch<EcosystemProjectSettings>(
        `/api/ecosystem/projects/${projectId}/settings`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecosystem', 'project-settings', projectId] });
    },
  });
}

// ============================================================
// v1.5.0-E: Failed repo retry
// ============================================================

/** POST /api/ecosystem/profiles/{repo_id}/retry — 立即重試失敗的倉 */
export function useRetryFailedRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (repoId: string) =>
      apiFetch<{ success: boolean; repo_full_name: string; next_action: string }>(
        `/api/ecosystem/profiles/${repoId}/retry`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'manual_retry' }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecosystem', 'profiles'] });
      qc.invalidateQueries({ queryKey: ['ecosystem', 'repo-full'] });
    },
  });
}

// ============================================================
// v1.5.0-E: Lifecycle batch dispatch (deep_review_request_batch)
// ============================================================

export interface LifecycleBatchIntent {
  repo_id: string;
  repo_full_name: string;
  deep_review_id: string;
  prompt: string;
  timeout_seconds: number;
  project_id: string | null;
}

export interface LifecycleBatchResponse {
  success: boolean;
  dispatched: number;
  intents: LifecycleBatchIntent[];
}

export interface LifecycleBatchInput {
  tags: string[];
  min_stars?: number | null;
  limit?: number;
  research_goal?: string;
}

export function useLifecycleRequestBatch() {
  return useMutation({
    mutationFn: async (input: LifecycleBatchInput) =>
      apiFetch<LifecycleBatchResponse>(`/api/ecosystem/lifecycle/request_batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: input.tags,
          min_stars: input.min_stars ?? null,
          limit: input.limit ?? 20,
          research_goal: input.research_goal ?? '',
        }),
      }),
  });
}

// v1.6.0 event sourcing

export interface RepoEvent {
  id: string;
  event_type: string;
  payload_json: Record<string, unknown>;
  source: string;
  scan_run_id: string | null;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  triggered_at: string;
}

export interface RepoEventsResponse {
  success: boolean;
  repo_id: string;
  events: RepoEvent[];
  total: number;
}

/** GET /api/ecosystem/repos/{repoId}/events */
export function useRepoEvents(repoId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['ecosystem', 'repo-events', repoId, limit],
    queryFn: () =>
      apiFetch<RepoEventsResponse>(`/api/ecosystem/repos/${repoId}/events?limit=${limit}`),
    enabled: !!repoId,
    staleTime: 30_000,
  });
}

// ============================================================
// v1.6.0: 掃描研究歷程 — events + deep_reviews 合併 timeline
// ============================================================

/** scan_history entry — 合併 event 與 deep_review，按時間倒序 */
export interface ScanHistoryEntry {
  kind: 'event' | 'deep_review';
  /** 事件型別 / 'deep_review_<stage_status>' */
  type: string;
  timestamp: string;
  /** 人類可讀一句話 */
  summary: string;
  source?: string;
  scan_run_id?: string | null;
  /** event 詳情 payload */
  payload?: Record<string, unknown>;
  /** deep_review 5 段式 markdown */
  expandable_md?: {
    summary?: string;
    architecture?: string;
    risks?: string;
    learnings?: string;
    integration?: string;
  };
  integration_recommendation?: string | null;
  stage_status?: string;
  review_id?: string;
}

export interface ScanHistoryResponse {
  success: boolean;
  repo_id: string;
  total: number;
  entries: ScanHistoryEntry[];
}

/** GET /api/ecosystem/repos/{repoId}/scan_history */
export function useScanHistory(repoId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['ecosystem', 'scan-history', repoId, limit],
    queryFn: () =>
      apiFetch<ScanHistoryResponse>(`/api/ecosystem/repos/${repoId}/scan_history?limit=${limit}`),
    enabled: !!repoId,
    staleTime: 30_000,
  });
}

// ============================================================
// v1.7.0: 淺掃批次管理
// ============================================================

/** 淺掃批次 — 與後端 EcosystemShallowBatch 對齊 */
export interface ShallowBatch {
  id: string;
  project_id: string | null;
  triggered_by: string;
  trigger_reason: string | null;
  candidates_count: number;
  status: string; // pending_approval / approved / running / completed / cancelled
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  new_repos_count: number;
  updated_repos_count: number;
  metadata_changed_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

/** 批次候選倉條目 */
export interface ShallowBatchItem {
  repo_id: string;
  repo_full_name: string;
  stars: number;
  stage_status: string;
  shallow_summary_excerpt: string;
  last_commit_at: string | null;
}

export interface ShallowBatchesResponse {
  batches: ShallowBatch[];
  total: number;
}

export interface ShallowBatchResponse {
  batch: ShallowBatch;
}

export interface ShallowBatchItemsResponse {
  batch_id: string;
  items: ShallowBatchItem[];
  total: number;
}

/** GET /api/ecosystem/shallow_batches */
export function useShallowBatches(limit = 50) {
  return useQuery({
    queryKey: ['ecosystem', 'shallow-batches', limit],
    queryFn: () =>
      apiFetch<ShallowBatchesResponse>(`/api/ecosystem/shallow_batches?limit=${limit}`),
    staleTime: 10_000,
  });
}

/** GET /api/ecosystem/shallow_batches/{batchId} */
export function useShallowBatch(batchId: string | null) {
  return useQuery({
    queryKey: ['ecosystem', 'shallow-batch', batchId],
    queryFn: () =>
      apiFetch<ShallowBatchResponse>(`/api/ecosystem/shallow_batches/${batchId}`),
    enabled: !!batchId,
    staleTime: 10_000,
  });
}

/** GET /api/ecosystem/shallow_batches/{batchId}/items */
export function useShallowBatchItems(batchId: string | null) {
  return useQuery({
    queryKey: ['ecosystem', 'shallow-batch-items', batchId],
    queryFn: () =>
      apiFetch<ShallowBatchItemsResponse>(`/api/ecosystem/shallow_batches/${batchId}/items`),
    enabled: !!batchId,
    staleTime: 15_000,
  });
}

/** POST /api/ecosystem/shallow_batches */
export function useCreateShallowBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { triggered_by: string; trigger_reason?: string }) =>
      apiFetch<{ success: boolean; batch_id: string; candidates_count: number; status: string; message: string }>(
        `/api/ecosystem/shallow_batches`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecosystem', 'shallow-batches'] });
    },
  });
}

/** POST /api/ecosystem/shallow_batches/{batchId}/approve */
export function useApproveBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, approvedBy }: { batchId: string; approvedBy: string }) =>
      apiFetch<{ success: boolean; batch_id: string; status: string; dr_created: number; message: string }>(
        `/api/ecosystem/shallow_batches/${batchId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved_by: approvedBy }),
        },
      ),
    onSuccess: (_data, { batchId }) => {
      qc.invalidateQueries({ queryKey: ['ecosystem', 'shallow-batches'] });
      qc.invalidateQueries({ queryKey: ['ecosystem', 'shallow-batch', batchId] });
    },
  });
}

/** POST /api/ecosystem/shallow_batches/{batchId}/cancel */
export function useCancelBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      apiFetch<{ success: boolean; batch_id: string; status: string; message: string }>(
        `/api/ecosystem/shallow_batches/${batchId}/cancel`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      ),
    onSuccess: (_data, batchId) => {
      qc.invalidateQueries({ queryKey: ['ecosystem', 'shallow-batches'] });
      qc.invalidateQueries({ queryKey: ['ecosystem', 'shallow-batch', batchId] });
    },
  });
}
