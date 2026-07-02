import { Link } from 'react-router-dom';
import { Network, ArrowRight, ArrowLeft, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RELATION_TYPE_LABELS } from '@/api/ecosystem';
import type { EcosystemRelation } from '@/api/ecosystem';

interface RelationsSectionProps {
  /** 當前倉 → 其他倉 */
  outgoing: EcosystemRelation[];
  /** 其他倉 → 當前倉 */
  incoming: EcosystemRelation[];
  /** 當前倉的 repo_full_name（用於標記自身節點） */
  currentRepoFullName: string;
}

function relationLabel(rt: string): string {
  return RELATION_TYPE_LABELS[rt] ?? rt;
}

/** 單條關聯行 */
function RelationRow({
  relation,
  direction,
  currentRepoFullName,
}: {
  relation: EcosystemRelation;
  direction: 'outgoing' | 'incoming';
  currentRepoFullName: string;
}) {
  const otherFullName =
    direction === 'outgoing'
      ? relation.target_repo_full_name
      : relation.source_repo_full_name;
  const otherId =
    direction === 'outgoing' ? relation.target_repo_id : relation.source_repo_id;

  const ArrowIcon = direction === 'outgoing' ? ArrowRight : ArrowLeft;
  const directionLabel = direction === 'outgoing' ? '指向' : '來自';

  return (
    <div className="flex items-center gap-2 py-1.5 text-xs border-b border-border/40 last:border-0">
      <Badge variant="outline" className="text-[10px] shrink-0">
        {relationLabel(relation.relation_type)}
      </Badge>
      <ArrowIcon className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
      <Link
        to={`/ecosystem/${otherId}`}
        className="font-medium text-primary hover:underline truncate min-w-0 flex-1"
        title={otherFullName ?? otherId}
      >
        {otherFullName ?? otherId}
      </Link>
      {otherFullName && (
        <a
          href={`https://github.com/${otherFullName}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`在 GitHub 開啟 ${otherFullName}`}
          className="text-muted-foreground hover:text-primary shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
      <span className="text-[10px] text-muted-foreground shrink-0" title="置信度">
        {(relation.confidence * 100).toFixed(0)}%
      </span>
      <span className="sr-only">
        {directionLabel} {currentRepoFullName}
      </span>
    </div>
  );
}

/**
 * 關聯倉區 — 展示當前倉與其他倉的引用 / 衍生關係。
 */
export function RelationsSection({
  outgoing,
  incoming,
  currentRepoFullName,
}: RelationsSectionProps) {
  const total = (outgoing?.length ?? 0) + (incoming?.length ?? 0);

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4" aria-hidden="true" />
            關聯倉
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          暫無關聯記錄 — 標籤器/深掃尚未識別到引用、衍生或替代關係。
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="h-4 w-4" aria-hidden="true" />
          關聯倉 ({total})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {outgoing && outgoing.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
              當前倉指向 ({outgoing.length})
            </h4>
            <div className="space-y-0">
              {outgoing.map((rel) => (
                <RelationRow
                  key={rel.id}
                  relation={rel}
                  direction="outgoing"
                  currentRepoFullName={currentRepoFullName}
                />
              ))}
            </div>
          </div>
        )}
        {incoming && incoming.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
              被引用於 ({incoming.length})
            </h4>
            <div className="space-y-0">
              {incoming.map((rel) => (
                <RelationRow
                  key={rel.id}
                  relation={rel}
                  direction="incoming"
                  currentRepoFullName={currentRepoFullName}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
