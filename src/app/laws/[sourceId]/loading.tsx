import { Panel, Skeleton } from "@/components/ui";

// 법령 상세 로딩 — 헤더 + 메타 줄 + 탭 + 조문 카드 골격.
export default function LawDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-content px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="mt-4 h-8 w-2/3 max-w-lg" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      <div className="mt-8 flex gap-8">
        <div className="min-w-0 flex-1 space-y-6">
          <div className="flex gap-4 border-b border-line pb-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <Panel key={i} className="overflow-hidden">
              <div className="border-b border-line px-5 py-3">
                <Skeleton className="h-5 w-40" />
              </div>
              <div className="grid gap-px md:grid-cols-2">
                <div className="space-y-2 p-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
                <div className="space-y-2 p-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              </div>
            </Panel>
          ))}
        </div>
        <div className="hidden w-[264px] shrink-0 space-y-3 xl:block">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
