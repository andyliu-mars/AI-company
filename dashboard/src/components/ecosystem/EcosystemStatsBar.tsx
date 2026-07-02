import { useMemo } from 'react';
import { Boxes, FileSearch, Archive, Tag, FolderOpen, Folder } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { EcosystemRepoProfile, EcosystemFacetCounts } from '@/api/ecosystem';
import { TOPIC_COLOR_PALETTE } from '@/api/ecosystem';
import { useProject } from '@/context/ProjectContext';

interface EcosystemStatsBarProps {
  /** 完整列表（filter 之前），用於計算待深掃/失活/總數 */
  allProfiles: EcosystemRepoProfile[];
  /** 後端 facet_counts（啟用 facetCounts=true 時返回） */
  facetCounts?: EcosystemFacetCounts;
  /** 後端彙報的總數（帶後端篩選後的結果數） */
  total?: number;
}

/** 單個統計卡片 */
function StatCard({
  Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  Icon: typeof Boxes;
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'primary' | 'warning' | 'info';
}) {
  const toneClass: Record<string, string> = {
    default: 'text-foreground',
    primary: 'text-primary',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400',
  };
  return (
    <Card className="px-3 py-2 flex flex-col gap-0.5 min-w-0 flex-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
      <span className={`text-xl font-semibold leading-none ${toneClass[tone]}`}>
        {value}
      </span>
      {hint && (
        <span className="text-[10px] text-muted-foreground truncate" title={hint}>
          {hint}
        </span>
      )}
    </Card>
  );
}

/**
 * 統計條 — ecosystem 列表頁頂部的指標檢視（按當前選中專案的生態庫統計）。
 *
 * 語義說明（Release blocker 修復）：
 *   - 已深掃 = EcosystemDeepReview.status='completed' 真實行數（不是 needs_deep_review=False）
 *   - 待深掃 = profile.needs_deep_review=True 的倉數
 *   - 失活 = is_archived=True 或 last_commit_at > 365 天
 *   - 覆蓋率 = 已深掃 / 總倉數
 *
 * 之前的 bug：用 `profile.needs_deep_review === false` 等同於"已深掃"導致顯示 163，
 * 但真實只有 3 條 completed DeepReview。"needs_deep_review" 語義是"是否需要被深掃"，
 * false 包含了"低相關性自動跳過"和"已完成"兩種情況，不能等同於已深掃。
 */
export function EcosystemStatsBar({
  allProfiles,
  facetCounts,
  total,
}: EcosystemStatsBarProps) {
  const { projectName } = useProject();

  const stats = useMemo(() => {
    const totalCount = total ?? allProfiles.length;
    // v1.5.1：待淺掃總數用後端 facet 全量值（不被 limit=200 截斷）；
    // facet 不可用時退回到列表估算（標記為下界）。
    const stageFacet = facetCounts?.stage ?? {};
    const needsDeepCount =
      facetCounts?.stage !== undefined
        ? stageFacet.queued ?? 0
        : allProfiles.filter((p) => (p.stage_status ?? 'queued') === 'queued').length;
    // v1.6.0 "已歸檔"：優先用 last_active_status（GitHub archived / 人工標記無價值），
    // 缺欄位則 fallback 到舊規則（is_archived || last_commit > 365 天）。
    const now = Date.now();
    const hasStatusField = allProfiles.some((p) => p.last_active_status != null);
    const archivedCount = hasStatusField
      ? allProfiles.filter(
          (p) =>
            p.last_active_status === 'archived' ||
            p.last_active_status === 'manual_archived',
        ).length
      : allProfiles.filter((p) => {
          if (p.is_archived) return true;
          if (!p.last_commit_at) return false;
          const days = (now - new Date(p.last_commit_at).getTime()) / (1000 * 60 * 60 * 24);
          return days > 365;
        }).length;
    // 已深掃總數 = stage 進入 architecture_done+ 的全量
    const deepDoneCount =
      (stageFacet.architecture_done ?? 0) +
      (stageFacet.debated ?? 0) +
      (stageFacet.referenced ?? 0) +
      (stageFacet.integrated ?? 0);
    const isFacetAvailable = facetCounts?.stage !== undefined;
    return { totalCount, needsDeepCount, archivedCount, deepDoneCount, isFacetAvailable };
  }, [allProfiles, facetCounts, total]);

  // v1.6.0 SST: Top 8 熱門 topics（GitHub 原生 topics 維度，取代基於啟發式的 category）
  // 用 facet_counts.topics 全量統計，不被 limit 截斷
  const topTopics = useMemo(() => {
    if (!facetCounts?.topics) return [];
    return Object.entries(facetCounts.topics)
      .filter(([, n]) => n > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
  }, [facetCounts]);

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {/* 當前專案 chip — 讓使用者始終知道在看哪個專案的資料 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">當前檢視:</span>
        <Badge
          variant="outline"
          className={`text-xs gap-1 ${projectName ? 'border-primary/40 bg-primary/5 text-primary' : ''}`}
        >
          {projectName ? (
            <FolderOpen className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Folder className="h-3 w-3" aria-hidden="true" />
          )}
          {projectName ?? '全部專案'}
        </Badge>
        {topTopics.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground ml-2">熱門 Topics:</span>
            <div className="flex items-center gap-1 flex-wrap">
              {topTopics.map(([topic, n], idx) => (
                <Badge
                  key={topic}
                  variant="secondary"
                  className={`text-[10px] gap-1 ${TOPIC_COLOR_PALETTE[idx % TOPIC_COLOR_PALETTE.length]}`}
                >
                  <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                  {topic}
                  <span className="ml-0.5 opacity-70">{n}</span>
                </Badge>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 數值卡片排（v1.5.1：用 facet stage 全量統計，不被 limit 截斷）*/}
      <div className="flex flex-wrap gap-2">
        <StatCard
          Icon={Boxes}
          label="當前檢視"
          value={stats.totalCount}
          hint="所有庫永久參與搜尋；勾選「顯示已刪除」可檢視刪除/轉私有倉"
          tone="default"
        />
        <StatCard
          Icon={FileSearch}
          label="待淺掃"
          value={stats.needsDeepCount}
          hint="淺掃=讀 README/CHANGELOG/release 摘要功能與設計方向（自動批次）"
          tone="info"
        />
        <StatCard
          Icon={FileSearch}
          label="已被研究"
          value={stats.deepDoneCount}
          hint="該倉被納入過系統改動調研（卡片/詳情可看研究次數與歷程）"
          tone="primary"
        />
        <StatCard
          Icon={Archive}
          label="已歸檔"
          value={stats.archivedCount}
          hint="GitHub archived 或人工標記無價值"
          tone="warning"
        />
      </div>
    </div>
  );
}
