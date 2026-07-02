import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileSearch,
  Building2,
  ShieldAlert,
  Lightbulb,
  Beaker,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DEEP_REVIEW_STATUS_LABELS,
  INTEGRATION_RECOMMENDATION_LABELS,
  STAGE_STATUS_LABELS,
  stageBadgeClass,
} from '@/api/ecosystem';
import type { EcosystemDeepReview } from '@/api/ecosystem';
import { useReportDetail } from '@/api/reports';

interface DeepReviewSectionProps {
  reviews: EcosystemDeepReview[];
  /** 淺掃摘要（profile 級，用於 stage=shallow_done 時顯示，避免一堆"暫無資料"） */
  shallowSummary?: string | null;
}

/**
 * v1.5.2 fix: 後端某些 datetime 欄位無 +00:00（如 completed_at），
 * 直接 new Date(...) 會按瀏覽器本地時區解析，與 started_at 的 UTC 形成時差。
 * 此函式顯式按 UTC 解析裸字串。
 */
function parseAsUtc(s: string | null | undefined): number {
  if (!s) return NaN;
  // 已含時區或 Z 字尾，原樣解析
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    return new Date(s).getTime();
  }
  // 裸字串：把 "2026-05-08 09:20:23.268270" 當作 UTC
  const normalized = s.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1') + 'Z';
  return new Date(normalized).getTime();
}

/** 狀態徽章 */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { className: string; Icon: typeof CheckCircle2 }> = {
    completed: {
      className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
      Icon: CheckCircle2,
    },
    running: { className: 'bg-blue-500/10 text-blue-600 border-blue-500/30', Icon: Loader2 },
    pending: { className: 'bg-muted text-muted-foreground border-border', Icon: Clock },
    failed: { className: 'bg-rose-500/10 text-rose-600 border-rose-500/30', Icon: XCircle },
    skipped: { className: 'bg-amber-500/10 text-amber-600 border-amber-500/30', Icon: XCircle },
  };
  const { className, Icon } = map[status] ?? map.pending;
  const label = DEEP_REVIEW_STATUS_LABELS[status] ?? status;
  return (
    <Badge variant="outline" className={`text-xs ${className}`}>
      <Icon className={`h-3 w-3 mr-1 ${status === 'running' ? 'animate-spin' : ''}`} aria-hidden="true" />
      {label}
    </Badge>
  );
}

/** 整合建議徽章 */
function RecommendationBadge({ rec }: { rec: string | null }) {
  if (!rec) return null;
  const styles: Record<string, string> = {
    adopt: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
    experiment: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40',
    hold: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
    avoid: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
  };
  const label = INTEGRATION_RECOMMENDATION_LABELS[rec] ?? rec;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${styles[rec] ?? ''}`}>
      建議：{label}
    </Badge>
  );
}

/** Markdown 子節渲染 — 摺疊/展開。空欄位時顯示"暫無資料"佔位而非整段隱藏。 */
function MarkdownBlock({
  title,
  Icon,
  body,
  hideWhenEmpty = false,
}: {
  title: string;
  Icon: typeof Building2;
  body: string;
  /** true 時空欄位徹底不渲染（用於 demo log 這類可選塊），預設 false 顯示佔位 */
  hideWhenEmpty?: boolean;
}) {
  const isEmpty = !body || !body.trim();
  if (isEmpty && hideWhenEmpty) return null;
  return (
    <section className="space-y-1.5">
      <h4 className="text-sm font-semibold flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        {title}
      </h4>
      <div className="md-prose text-sm max-w-none pl-5">
        {isEmpty ? (
          <p className="text-xs text-muted-foreground italic">暫無資料 — 該欄位將在對應 stage 完成後填充</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        )}
      </div>
    </section>
  );
}

/** 單條評審記錄卡片（含淺掃 / 架構深掃 / 辯論 / 整合等多 stage） */
function ReviewCard({
  review,
  shallowSummary,
}: {
  review: EcosystemDeepReview;
  shallowSummary?: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showFullReport, setShowFullReport] = useState(false);

  const { data: reportDetail, isLoading: reportLoading } = useReportDetail(
    showFullReport && review.report_id ? review.report_id : null,
  );

  const formatDate = (iso: string): string => {
    const ms = parseAsUtc(iso);
    if (Number.isNaN(ms)) return iso;
    return new Date(ms).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 評審實際耗時：基於 started_at→(shallow_completed_at | completed_at) 的差值。
  // 歷史 row duration_seconds 多為 0，前端按 UTC 解析裸字串自算。
  const formatElapsed = (
    start: string | null | undefined,
    end: string | null | undefined,
  ): string => {
    if (!start || !end) return '—';
    const ms = parseAsUtc(end) - parseAsUtc(start);
    if (Number.isNaN(ms) || ms <= 0) return '—';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ${sec % 60}s`;
    const hr = Math.floor(min / 60);
    return `${hr}h ${min % 60}m`;
  };

  const stage = (review.stage_status as string) ?? '';
  const isShallowOnly = stage === 'shallow_done' || stage === 'queued' || stage === 'shallow_failed';
  const stageLabel = stage
    ? STAGE_STATUS_LABELS[stage as keyof typeof STAGE_STATUS_LABELS] ?? stage
    : null;
  const stageClass = stage ? stageBadgeClass(stage) : '';

  // v1.5.2: 淺掃階段 summary/architecture/risks/learnings 必空，shallow_summary 在 profile 上。
  // 改用 stage 決定顯示哪些欄位，避免"已完成"+"一堆暫無資料"的違和感。
  const showDeepFields = !isShallowOnly;
  const hasDeepContent = useMemo(
    () =>
      Boolean(
        review.summary_md ||
          review.architecture_md ||
          review.risks_md ||
          review.learnings_md ||
          review.demo_log_excerpt,
      ),
    [review],
  );

  // 淺掃完成時的耗時端點優先 shallow_completed_at（若 backend 沒寫 completed_at）
  const elapsedEnd = isShallowOnly
    ? review.shallow_completed_at ?? review.completed_at
    : review.completed_at;

  return (
    <div className="border rounded-md p-3 space-y-3 bg-card">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* v1.5.2: 有 stage_status 時只顯示 stage 徽章，避免 status='running'+stage='shallow_done'
              同時顯示「深掃中（spinner）」+「淺掃完成」的語義衝突。失敗/整合等終態下退回 status badge。 */}
          {stageLabel ? (
            <Badge variant="outline" className={`text-xs ${stageClass}`} title="當前 stage 進度">
              {stageLabel}
            </Badge>
          ) : (
            <StatusBadge status={review.status} />
          )}
          <RecommendationBadge rec={review.integration_recommendation} />
          <span className="text-xs text-muted-foreground" title="建立時間">
            {formatDate(review.created_at)}
          </span>
          <span className="text-xs text-muted-foreground" title="started_at → 當前 stage 完成時間">
            耗時 {formatElapsed(review.started_at, elapsedEnd)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? '收起評審詳情' : '展開評審詳情'}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              收起
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              展開
            </>
          )}
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3">
          {/* 淺掃階段：直接展示 profile.shallow_summary，不顯示深掃專屬空欄位 */}
          {isShallowOnly && shallowSummary && (
            <MarkdownBlock title="淺掃摘要" Icon={FileSearch} body={shallowSummary} />
          )}
          {isShallowOnly && (
            <p className="text-xs text-muted-foreground italic">
              當前為淺掃階段。架構 / 風險 / 學習要點等欄位將在進入深掃後填充。
            </p>
          )}

          {/* 深掃及以後：顯示 5 段式 markdown 欄位 */}
          {showDeepFields && !hasDeepContent && !review.report_id && review.status === 'running' && (
            <div className="flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded p-2">
              <Loader2 className="h-3.5 w-3.5 mt-0.5 shrink-0 animate-spin" aria-hidden="true" />
              <span>評審進行中 — 當前 stage 完成後，本卡片對應欄位將自動填充。可稍後重新整理本頁檢視。</span>
            </div>
          )}
          {showDeepFields && !hasDeepContent && !review.report_id && review.status === 'pending' && (
            <p className="text-xs text-muted-foreground italic">
              該評審記錄待啟動，進入下一輪 stage 排程後將自動開始。
            </p>
          )}
          {showDeepFields && (
            <>
              <MarkdownBlock title="摘要" Icon={FileSearch} body={review.summary_md} />
              <MarkdownBlock title="架構" Icon={Building2} body={review.architecture_md} />
              <MarkdownBlock title="風險" Icon={ShieldAlert} body={review.risks_md} />
              <MarkdownBlock title="學習要點" Icon={Lightbulb} body={review.learnings_md} />
            </>
          )}

          {(review.demo_result || review.demo_log_excerpt) && (
            <section className="space-y-1.5">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Beaker className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                Demo 執行
                {review.demo_result && (
                  <Badge variant="outline" className="text-[10px] ml-1">
                    {review.demo_result}
                  </Badge>
                )}
              </h4>
              {review.demo_log_excerpt && (
                <pre className="text-[11px] bg-muted/50 border rounded p-2 max-h-60 overflow-auto whitespace-pre-wrap break-words">
                  {review.demo_log_excerpt}
                </pre>
              )}
            </section>
          )}

          {review.report_id && (
            <div className="pt-2 border-t border-border/50">
              {!showFullReport ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowFullReport(true)}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  檢視完整報告
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">完整報告內容</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setShowFullReport(false)}
                    >
                      收起
                    </Button>
                  </div>
                  {reportLoading ? (
                    <p className="text-xs text-muted-foreground">載入報告中...</p>
                  ) : reportDetail ? (
                    <div className="md-prose text-sm max-w-none border rounded p-3 bg-muted/30 max-h-96 overflow-auto">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {reportDetail.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">報告載入失敗</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 評審記錄區 — 展示該倉所有評審記錄（淺/深/辯/整合多 stage 共享一行，最新優先）。
 */
export function DeepReviewSection({ reviews, shallowSummary }: DeepReviewSectionProps) {
  if (!reviews || reviews.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSearch className="h-4 w-4" aria-hidden="true" />
            評審記錄
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          尚未對該倉庫生成評審記錄。先經淺掃生成 200-400 字摘要，再按相關性進入深掃排程。
        </CardContent>
      </Card>
    );
  }

  // 按時間倒序
  const sorted = [...reviews].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSearch className="h-4 w-4" aria-hidden="true" />
          評審記錄 ({reviews.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((review) => (
          <ReviewCard key={review.id} review={review} shallowSummary={shallowSummary} />
        ))}
      </CardContent>
    </Card>
  );
}
