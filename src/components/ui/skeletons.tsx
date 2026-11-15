// 실제 레이아웃과 닮은 skeleton.
// "Loading…" 텍스트만 띄우지 않는다 — 로딩이 끝났을 때 레이아웃이 튀지 않도록
// 완성 화면과 같은 골격을 그린다.

import { Panel, Skeleton } from "./index";

/** 페이지 제목 + 설명 + action 자리. */
export function PageHeaderSkeleton({ withActions = true }: { withActions?: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="w-full max-w-md">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-3 h-4 w-72" />
      </div>
      {withActions ? <Skeleton className="h-9 w-28" /> : null}
    </div>
  );
}

/** 목록 행 n개. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Panel className="divide-y divide-line overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-3/4" />
          </div>
          <Skeleton className="h-4 w-14 shrink-0" />
        </div>
      ))}
    </Panel>
  );
}

/** 대시보드 지표 strip. */
export function StatStripSkeleton() {
  return (
    <div className="grid grid-cols-2 rounded-md border border-line bg-surface sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="px-5 py-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2.5 h-7 w-10" />
        </div>
      ))}
    </div>
  );
}

/** 필터 한 줄. */
export function FilterBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-10 w-full max-w-sm" />
      <Skeleton className="h-10 w-36" />
      <Skeleton className="h-10 w-20" />
    </div>
  );
}
