"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Props {
  sourceId: string;
  activeTab: "diff" | "full";
  diffCount: number;
  articleCount: number;
}

export function LawDetailTabs({ sourceId, activeTab, diffCount, articleCount }: Props) {
  const searchParams = useSearchParams();

  const buildHref = (tab: "diff" | "full") => {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === "diff") {
      next.delete("tab"); // diff 는 default 라 URL 깔끔하게
    } else {
      next.set("tab", "full");
      // 전문 탭에서는 조문 필터가 의미 없음
      next.delete("type");
      next.delete("onlyChanged");
    }
    const qs = next.toString();
    return `/laws/${sourceId}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex items-end gap-1 border-b border-line" role="tablist">
      <TabLink
        href={buildHref("diff")}
        active={activeTab === "diff"}
        label="개정 이력"
        count={diffCount}
      />
      <TabLink
        href={buildHref("full")}
        active={activeTab === "full"}
        label="조문 전문"
        count={articleCount}
      />
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-base font-medium transition-colors duration-swift ${
        active
          ? "border-primary text-fg"
          : "border-transparent text-fg-secondary hover:border-line-strong hover:text-fg"
      }`}
    >
      {label}
      <span className="ml-1.5 text-sm font-normal tabular text-fg-muted">{count}</span>
    </Link>
  );
}
