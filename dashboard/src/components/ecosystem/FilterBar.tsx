import { useMemo, useRef, useState, useEffect } from 'react';
import { Search, Star, Tag, X, ChevronDown, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import type { EcosystemFilters, EcosystemFacetCounts } from '@/api/ecosystem';

interface FilterBarProps {
  /** 當前篩選條件 */
  filters: EcosystemFilters;
  /** 篩選條件變更回撥 */
  onChange: (next: EcosystemFilters) => void;
  /** 命中數量（用於展示） */
  totalCount?: number;
  /** 後端 facet 聚合（啟用時類別篩選項後跟數量） */
  facetCounts?: EcosystemFacetCounts;
}

const STAR_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '不限星標' },
  { value: 100, label: '≥ 100' },
  { value: 1000, label: '≥ 1k' },
  { value: 5000, label: '≥ 5k' },
  { value: 15000, label: '≥ 15k' },
  { value: 50000, label: '≥ 50k' },
];

const ALL = '__all__';

/**
 * 列表頁篩選欄 — 關鍵詞搜尋 + Topics 多選 + 星標閾值 + 深掃狀態。
 * v1.6.0：刪除"類別"單選（啟發式分類廢棄），改為 GitHub topics 多選篩選（客戶端 filter）。
 * 移動端單列堆疊，桌面端橫向鋪開。
 */
export function FilterBar({ filters, onChange, totalCount, facetCounts }: FilterBarProps) {
  const topicFacets = facetCounts?.topics ?? {};
  const update = (patch: Partial<EcosystemFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const resetAll = () => {
    onChange({ limit: filters.limit ?? 200 });
  };

  // v1.6.0：預設全集（含已刪除，因數量極少），勾選則切換為"僅已刪除"檢視
  const onlyDeleted = filters.isDeleted === true;
  const selectedTopics = filters.topics ?? [];

  const hasActiveFilter = Boolean(
    filters.keyword ||
      filters.topic ||
      selectedTopics.length > 0 ||
      (filters.minStars && filters.minStars > 0) ||
      filters.stageStatus ||
      onlyDeleted,
  );

  // 按數量降序排序 topics，取 top 50（避免 2425 個全部塞進 dropdown）
  const sortedTopics = useMemo(() => {
    return Object.entries(topicFacets)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50);
  }, [topicFacets]);

  // 星標 trigger 顯示文本
  const minStarsValue = filters.minStars ?? 0;
  const starLabel = STAR_OPTIONS.find((o) => o.value === minStarsValue)?.label ?? '不限星標';

  // 研究階段 trigger 顯示文本（v1.5.1：3 類互斥，語義對齊 StatsBar）
  const STAGE_LABELS: Record<string, string> = {
    queued: '待淺掃',
    shallow_done: '已淺掃未研究',
    'architecture_done,debated,referenced,integrated': '已被研究',
  };
  const stageLabel = filters.stageStatus
    ? (STAGE_LABELS[filters.stageStatus] ?? filters.stageStatus)
    : '全部倉';

  return (
    <div className="flex flex-col gap-3 p-4 border-b bg-muted/20">
      {/* 第一行：搜尋框 + 命中計數 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="搜尋倉庫名 / owner / 描述..."
            value={filters.keyword ?? ''}
            onChange={(e) => update({ keyword: e.target.value })}
            className="pl-9 h-9"
            aria-label="搜尋倉庫"
          />
        </div>
        {typeof totalCount === 'number' && (
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            共 <span className="font-semibold text-foreground">{totalCount}</span> 個倉庫
          </div>
        )}
      </div>

      {/* 第二行：維度篩選 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* v1.6.0: Topics 多選篩選（替換原 relevance_category 單選） */}
        <TopicsMultiSelect
          options={sortedTopics}
          selected={selectedTopics}
          onChange={(next) => update({ topics: next.length > 0 ? next : undefined })}
        />

        {/* 星標閾值 */}
        <Select
          value={String(minStarsValue)}
          onValueChange={(v) => update({ minStars: Number(v) })}
        >
          <SelectTrigger className="h-8 min-w-[140px] text-sm" aria-label="星標閾值">
            <Star className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{starLabel}</span>
          </SelectTrigger>
          <SelectContent>
            {STAR_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 研究階段（v1.5.0 漏斗，v1.5.1 加語義說明）*/}
        <Select
          value={filters.stageStatus || ALL}
          onValueChange={(v) =>
            update({
              stageStatus: !v || v === ALL ? '' : v,
            })
          }
        >
          <SelectTrigger
            className="h-8 min-w-[170px] text-sm"
            aria-label="研究階段"
            title="淺掃=讀 README/CHANGELOG 摘要功能與方向；研究=按需調研程式碼結構與設計，含相關性與採納記錄"
          >
            <span className="truncate">{stageLabel}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部倉</SelectItem>
            <SelectItem value="queued">
              <span className="flex flex-col">
                <span>待淺掃</span>
                <span className="text-[10px] text-muted-foreground">尚未讀 README/CHANGELOG</span>
              </span>
            </SelectItem>
            <SelectItem value="shallow_done">
              <span className="flex flex-col">
                <span>已淺掃未研究</span>
                <span className="text-[10px] text-muted-foreground">已摘要功能/設計方向</span>
              </span>
            </SelectItem>
            <SelectItem value="architecture_done,debated,referenced,integrated">
              <span className="flex flex-col">
                <span>已被研究</span>
                <span className="text-[10px] text-muted-foreground">為系統改動做過調研</span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* v1.6.0：替代被刪除的"已刪除" tab — 切換"僅看已刪除"檢視 */}
        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none h-8 px-2 rounded-md hover:bg-muted/40"
          title="勾選後僅顯示已被檢測為刪除/轉為私有的倉（預設檢視包含全部倉）"
        >
          <input
            type="checkbox"
            checked={onlyDeleted}
            onChange={(e) =>
              // 勾選 → isDeleted=true（僅已刪除）；取消 → undefined（全集，預設）
              update({ isDeleted: e.target.checked ? true : undefined })
            }
            className="h-3.5 w-3.5 rounded border-border accent-primary"
            aria-label="僅看已刪除倉"
          />
          僅看已刪除
        </label>

        {/* TODO(Stage E v2): 增加 has_deep_review / is_archived / tags 多選篩選 */}

        {hasActiveFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetAll}
            className="h-8 ml-auto text-muted-foreground"
            aria-label="清除所有篩選"
          >
            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            清除
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Topics 多選下拉 — 顯示帶數量的 topic 列表，支援搜尋過濾。
 * v1.6.0: 替代原 relevance_category 單選；用 facet_counts.topics 作為選項資料來源。
 */
function TopicsMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: [string, number][];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // 點選外部關閉
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(([name]) => name.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (topic: string) => {
    const next = selected.includes(topic)
      ? selected.filter((t) => t !== topic)
      : [...selected, topic];
    onChange(next);
  };

  const triggerLabel =
    selected.length === 0
      ? '全部 Topics'
      : selected.length === 1
        ? selected[0]
        : `${selected.length} 個 Topics`;

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 min-w-[170px] justify-between text-sm font-normal"
        onClick={() => setOpen((v) => !v)}
        aria-label="篩選 Topics（多選）"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border bg-popover shadow-md">
          <div className="p-2 border-b">
            <Input
              autoFocus
              placeholder="搜尋 topic..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 text-xs"
            />
            {selected.length > 0 && (
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground">
                  已選 {selected.length} 個
                </span>
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline"
                  onClick={() => onChange([])}
                >
                  清空
                </button>
              </div>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">無匹配 topic</p>
            ) : (
              filtered.map(([topic, count]) => {
                const isSelected = selected.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggle(topic)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-accent ${
                      isSelected ? 'bg-accent/50' : ''
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border'
                        }`}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5" aria-hidden="true" />}
                      </span>
                      <span className="truncate">{topic}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{count}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
