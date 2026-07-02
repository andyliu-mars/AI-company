import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Boxes, ChevronLeft, ChevronRight, Search as SearchIcon, Layers } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useEcosystemProfiles } from '@/api/ecosystem';
import type { EcosystemFilters } from '@/api/ecosystem';
import { RepoCard } from '@/components/ecosystem/RepoCard';
import { FilterBar } from '@/components/ecosystem/FilterBar';
import { EcosystemStatsBar } from '@/components/ecosystem/EcosystemStatsBar';
import { RecentScanRunsBar } from '@/components/ecosystem/RecentScanRunsBar';
import { EcosystemProjectFilter } from '@/components/ecosystem/EcosystemProjectFilter';
import { useProject } from '@/context/ProjectContext';

/**
 * Ecosystem 列表頁 — v1.6.0：取消失活篩選，所有庫永久參與搜尋。
 * 專案篩選 = 本頁頭部的「生態庫專案」下拉 (EcosystemProjectFilter，按專案隔離生態庫)。
 * ⚠️ 這是 ecosystem 專屬篩選，切勿移到全域性 Header（歷史教訓詳見 EcosystemProjectFilter.tsx）。
 * "顯示已刪除" 由 FilterBar 內 checkbox 控制（預設隱藏）。
 *
 * 路徑：/ecosystem
 * 資料來源：GET /api/ecosystem/profiles?facet_counts=true&is_deleted=...
 */
const PAGE_SIZE = 100;

export function EcosystemListPage() {
  const { projectId, projectName } = useProject();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<EcosystemFilters>({
    limit: PAGE_SIZE,
    facetCounts: true,
  });

  // 篩選條件變化時重置到第 1 頁（防止 page=3 但只剩 50 條空白）
  useEffect(() => {
    setPage(1);
  }, [filters]);

  // v1.6.0 設計哲學：所有庫永久參與搜尋，不再預設排除已刪除/失活倉。
  // FilterBar 勾選"顯示已刪除"時不變化（已含），未勾選時顯式 isDeleted=false 僅看活躍倉。
  // - filters.isDeleted=null  → showDeleted 勾選 → 不傳參（全集 265）
  // - filters.isDeleted=undefined（預設）→ 不傳參（全集 265，符合 v1.6.0 哲學）
  // - filters.isDeleted=false → 僅未刪除
  const effectiveFilters = useMemo<EcosystemFilters>(() => {
    return { ...filters, offset: (page - 1) * PAGE_SIZE };
  }, [filters, page]);

  const { data, isLoading, error } = useEcosystemProfiles(effectiveFilters);
  const profiles = data?.profiles ?? [];

  // 客戶端二次過濾：keyword 匹配 owner/description；v1.6.0 topics 多選 OR 求交集
  const filtered = useMemo(() => {
    const q = filters.keyword?.toLowerCase() ?? '';
    const selectedTopics = filters.topics ?? [];
    if (!q && selectedTopics.length === 0) return profiles;
    return profiles.filter((p) => {
      if (q) {
        const matchKw =
          p.repo_full_name.toLowerCase().includes(q) ||
          (p.owner ?? '').toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.description ?? p.description_excerpt ?? '').toLowerCase().includes(q) ||
          (p.one_line_summary ?? '').toLowerCase().includes(q);
        if (!matchKw) return false;
      }
      if (selectedTopics.length > 0) {
        const repoTopics = p.topics ?? [];
        // OR 語義：profile 的 topics 與 selected 有交集即通過
        const hit = selectedTopics.some((t) => repoTopics.includes(t));
        if (!hit) return false;
      }
      return true;
    });
  }, [profiles, filters.keyword, filters.topics]);

  // v1.6.0: 全域性 topic 排名 map (StatsBar + RepoCard 共享)
  // 按 facet_counts.topics 排序後位置 → idx，讓卡片標籤顏色用全域性 idx (不是卡片內部 idx)
  const topicRankMap = useMemo<Record<string, number>>(() => {
    const fc = data?.facet_counts?.topics ?? {};
    return Object.entries(fc)
      .sort(([, a], [, b]) => b - a)
      .reduce<Record<string, number>>((acc, [topic], idx) => {
        acc[topic] = idx;
        return acc;
      }, {});
  }, [data?.facet_counts?.topics]);

  return (
    <div className="flex h-full flex-col">
      {/* 頁頭 */}
      <div className="border-b px-6 py-4 bg-background">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" aria-hidden="true" />
              <h1 className="text-xl font-semibold">生態倉檔案</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Claude Agent / MCP / Memory / Skill 等開源倉的廣索引檢視。點選卡片進入詳情。
              {projectName && (
                <>
                  {' '}當前已按專案 <span className="text-primary font-medium">{projectName}</span> 過濾。
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">生態庫專案</span>
            <EcosystemProjectFilter />
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              nativeButton={false}
              render={<Link to="/ecosystem/batches" />}
            >
              <Layers className="mr-1 h-4 w-4" aria-hidden="true" />
              淺掃批次
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            nativeButton={false}
            render={<Link to="/ecosystem/research" />}
          >
            <SearchIcon className="mr-1 h-4 w-4" aria-hidden="true" />
            查詢候選
          </Button>
        </div>
      </div>

      {/* 最近批次掃描概覽（v1.5.2: 從單倉詳情頁遷回生態檔案級位置） */}
      <RecentScanRunsBar />

      {/* 統計條 */}
      {!error && !isLoading && (
        <EcosystemStatsBar
          allProfiles={profiles}
          facetCounts={data?.facet_counts}
          total={data?.total}
        />
      )}

      {/* 篩選欄 */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        totalCount={filtered.length}
        facetCounts={data?.facet_counts}
      />

      {/* 列表區 */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-lg" />
            ))}
          </div>
        )}

        {error && (
          <div
            className="flex items-start gap-2 p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive"
            role="alert"
          >
            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-medium">載入生態檔案失敗</p>
              <p className="mt-1 text-xs opacity-80">
                {error.message}
                {error.message.includes('Not Found') && (
                  <span className="block mt-1">
                    提示：API server 可能尚未註冊 /api/ecosystem 路由，請確認後端已重啟。
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {!isLoading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <Boxes className="h-10 w-10 opacity-30 mb-2" aria-hidden="true" />
            <p className="text-sm">暫無匹配的倉庫</p>
            <p className="text-xs mt-1">
              {filters.keyword || filters.category || filters.minStars
                ? '調整篩選條件或清除過濾試試'
                : projectId
                  ? '當前專案下尚無生態倉檔案，可切換到「全部專案」或執行掃描任務後填充'
                  : '執行掃描任務後將填充檔案'}
            </p>
          </div>
        )}

        {!isLoading && !error && filtered.length > 0 && (
          <>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((repo) => (
                <RepoCard key={repo.id} repo={repo} topicRankMap={topicRankMap} />
              ))}
            </div>

            {/* 分頁器：僅在總數超過單頁時顯示 */}
            {(data?.total ?? 0) > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  第 <span className="font-medium text-foreground">{(page - 1) * PAGE_SIZE + 1}</span>
                  {' - '}
                  <span className="font-medium text-foreground">
                    {Math.min(page * PAGE_SIZE, data?.total ?? 0)}
                  </span>
                  {' '}/ 共 <span className="font-medium text-foreground">{data?.total ?? 0}</span> 倉
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                    上一頁
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    第 {page} / {Math.ceil((data?.total ?? 0) / PAGE_SIZE)} 頁
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data?.has_more}
                  >
                    下一頁
                    <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
