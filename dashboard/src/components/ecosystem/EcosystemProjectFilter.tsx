import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Folder, FolderOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject } from '@/context/ProjectContext';
import { useProjects } from '@/api/projects';

/**
 * 生態庫專案篩選器 — 選擇「檢視哪個專案的生態庫」。每個專案有自己方向的生態倉檔案。
 *
 * ⚠️ 作用域：這是 **ecosystem 專屬** 的專案篩選，只用於 ecosystem 列表頁 (/ecosystem)。
 *    切勿放回全域性 Header / components/layout —— 歷史教訓 (v1.6.0)：本元件原名
 *    `ProjectSwitcher`、放在 components/layout、掛在右上角 Header，並在 client.ts 被註釋為
 *    「Global project context」，導致被誤當成全域性應用切換器；而實際上除 ecosystem 外沒有
 *    任何頁面真正消費它（任務牆/報告等各有頁內篩選）。命名+目錄已糾正以鎖死語義。
 *    若將來真要做全域性專案切換，請另建元件，不要複用本元件。
 *
 * 切換時：
 *   1. ProjectContext.switchProject 同步更新 api/client 的 module-level state
 *      (X-Project-Id header) — 在 setState 之前寫入避免 race
 *   2. invalidateQueries — 重新整理查詢讓 ecosystem 列表按新專案重拉
 *      (注：當前 X-Project-Id 會附加到所有請求，故切換也會影響其它 header-scoped 呼叫；
 *       這是已知遺留，未來可改為僅對 ecosystem 請求附加 per-call header)
 */
export function EcosystemProjectFilter() {
  const { projectId, projectName, switchProject, clearProject } = useProject();
  const { data, isLoading } = useProjects();
  const qc = useQueryClient();

  const projects = data?.data ?? [];

  /**
   * 專案列表本身不按 X-Project-Id 隔離，切換時不要讓它跟著 refetch
   * (避免抖動)。其它所有 query (ecosystem/tasks/projects/{id}/...) 都需重新整理。
   */
  const invalidateProjectScopedQueries = () => {
    void qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey;
        if (Array.isArray(k) && k[0] === 'projects' && k.length === 1) return false;
        return true;
      },
    });
  };

  const handleSelect = (id: string, path: string, name: string) => {
    if (id === projectId) return;
    switchProject(id, path, name);
    invalidateProjectScopedQueries();
  };

  const handleClear = () => {
    if (projectId === null) return;
    clearProject();
    invalidateProjectScopedQueries();
  };

  if (isLoading) {
    return <Skeleton className="h-8 w-48" />;
  }

  const triggerLabel = projectName ?? '全部專案';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="切換生態庫專案"
        className="inline-flex items-center gap-1.5 h-8 px-3 max-w-[260px] rounded-md border border-input bg-background text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
      >
        {projectId ? (
          <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
        ) : (
          <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{triggerLabel}</span>
        <ChevronsUpDown className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">切換生態庫專案</div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleClear}>
          <span className="flex items-center gap-2 flex-1">
            <Folder className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm">全部專案</span>
          </span>
          {projectId === null && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {projects.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground text-center">暫無專案</div>
        ) : (
          projects.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => handleSelect(p.id, p.root_path, p.name)}
            >
              <span className="flex items-center gap-2 flex-1 min-w-0">
                <FolderOpen
                  className={`h-3.5 w-3.5 shrink-0 ${p.id === projectId ? 'text-primary' : 'text-muted-foreground'}`}
                  aria-hidden="true"
                />
                <span className="flex flex-col min-w-0">
                  <span className="text-sm truncate">{p.name}</span>
                  {p.root_path && (
                    <span className="text-[10px] text-muted-foreground truncate">{p.root_path}</span>
                  )}
                </span>
              </span>
              {p.id === projectId && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
