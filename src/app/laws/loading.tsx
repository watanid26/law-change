import {
  FilterBarSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
} from "@/components/ui/skeletons";

export default function LawsLoading() {
  return (
    <div className="mx-auto w-full max-w-content px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
      <PageHeaderSkeleton />
      <FilterBarSkeleton />
      <div className="mt-5">
        <ListSkeleton rows={8} />
      </div>
    </div>
  );
}
