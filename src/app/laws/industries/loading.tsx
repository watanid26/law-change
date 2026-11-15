import { Panel, Skeleton } from "@/components/ui";
import { PageHeaderSkeleton } from "@/components/ui/skeletons";

// /laws/loading.tsx 는 검색 결과 목록 모양이라 산업 카드 그리드와 형태가 달랐다.
// 뼈대가 실제 화면과 다르면 로딩이 끝날 때 레이아웃이 튀어 "깨졌다"는 인상을 준다.
export default function IndustriesLoading() {
  return (
    <div className="mx-auto w-full max-w-content px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
      <PageHeaderSkeleton withActions={false} />
      <div className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Panel key={i} className="rounded-none border-0 px-5 py-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-3 w-40" />
            <Skeleton className="mt-4 h-3 w-20" />
          </Panel>
        ))}
      </div>
    </div>
  );
}
