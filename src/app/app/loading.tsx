import {
  FilterBarSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
  StatStripSkeleton,
} from "@/components/ui/skeletons";

// 대시보드 로딩 — 실제 레이아웃(헤더 → 지표 strip → 2컬럼)과 같은 골격.
export default function AppLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatStripSkeleton />
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <ListSkeleton rows={5} />
        <div className="space-y-4">
          <FilterBarSkeleton />
          <ListSkeleton rows={3} />
        </div>
      </div>
    </>
  );
}
