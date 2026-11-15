import { Panel, Skeleton } from "@/components/ui";
import { PageHeaderSkeleton } from "@/components/ui/skeletons";

export default function CalendarLoading() {
  return (
    <>
      <PageHeaderSkeleton withActions={false} />
      <Panel className="p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-10 w-full" />
      </Panel>
      <div className="mt-8 space-y-8">
        {Array.from({ length: 2 }).map((_, s) => (
          <div key={s}>
            <Skeleton className="mb-4 h-5 w-24" />
            <Panel className="divide-y divide-line overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </Panel>
          </div>
        ))}
      </div>
    </>
  );
}
