"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { LawDetail } from "@/lib/types";

interface Props {
  counts: LawDetail["counts"];
  sourceId: string;
  selectedType: "all" | "added" | "modified" | "deleted" | "moved";
  onlyChanged: boolean;
}

// 5칸: 전체 · 신설 · 수정 · 삭제 · 이동. 활성/비활성 톤 구분.
const chips = [
  {
    id: "all",
    label: "전체",
    symbol: "",
    key: "total",
    activeCls: "border-line-strong bg-surface text-fg",
    idleCls: "border-line bg-surface text-fg-secondary",
  },
  {
    id: "added",
    label: "신설",
    symbol: "＋",
    key: "added",
    activeCls: "border-change-addedMark bg-change-addedPanel text-success",
    idleCls: "border-line bg-surface text-fg-secondary",
  },
  {
    id: "modified",
    label: "수정",
    symbol: "～",
    key: "modified",
    activeCls: "border-change-modifiedMark bg-change-modifiedPanel text-warning",
    idleCls: "border-line bg-surface text-fg-secondary",
  },
  {
    id: "deleted",
    label: "삭제",
    symbol: "－",
    key: "deleted",
    activeCls: "border-line-strong bg-subtle text-fg-muted",
    idleCls: "border-line bg-surface text-fg-secondary",
  },
  {
    id: "moved",
    label: "이동",
    symbol: "↔",
    key: "moved",
    activeCls: "border-dashed border-change-movedMark bg-change-movedPanel text-info",
    idleCls: "border-line bg-surface text-fg-secondary",
  },
] as const;

export function FilterBar({ counts, selectedType }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const applyParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 border-b border-line pb-4">
      <div className="flex items-center gap-2 flex-wrap">
        {chips.map((chip) => {
          const isActive = selectedType === chip.id;
          const count = counts[chip.key as keyof LawDetail["counts"]];
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => applyParam("type", chip.id === "all" ? null : chip.id)}
              aria-pressed={isActive}
              aria-label={`${chip.label} 필터 · ${count}건${isActive ? " · 활성" : ""}`}
              className={`inline-flex items-center gap-1.5 border px-3.5 py-1.5 text-sm font-semibold transition-colors duration-swift ease-swift hover:opacity-90 ${
                isActive ? chip.activeCls : `${chip.idleCls} hover:border-line-strong hover:text-fg`
              }`}
            >
              {chip.symbol && <span aria-hidden>{chip.symbol}</span>}
              <span>{chip.label}</span>
              <span className="text-xs">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="text-xs text-fg-muted">변경된 조문만 표시 중</div>
    </div>
  );
}
