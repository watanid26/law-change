"use client";

// 라운드 20: 변경 조문 목차 트리 — Diff 뷰 좌측 사이드바.
// 참고 레퍼런스: 법무 서비스 3단 마스터-세부 레이아웃 (좌측 목차 + 중앙 문서 + 우측 컨텍스트).
// 지금까지 diff 뷰는 카드 스택만 있어 "20건 개정" 같은 큰 목록에서 조문 위치를 잃음.
//
// 특징:
// - 4-변경타입 아이콘·색상 유지 (신설=올리브+/수정=앰버~/삭제=탈색-/이동=슬레이트↔)
// - IntersectionObserver 로 현재 스크롤 위치의 조문 하이라이트
// - sticky sidebar (top-24) · 스크롤 독립

import { useMemo } from "react";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { DisclosureSummary } from "./ui/DisclosureSummary";

type ChangeType = "added" | "modified" | "deleted" | "moved";

// 라운드 23 B1: 서버→클라이언트 함수 prop 전달은 Next.js 가 serialize 불가로 SSR 크래시.
// 심사 재현: 3건+ 개정 법령이 전부 500 에러. 원인은 이 파일이 아니라 페이지에서
// toAnchorId={articleAnchor} 로 함수를 넘긴 것. 이제 anchorId 를 미리 계산해서 문자열로만 전달.
interface TreeItem {
  articleKey: string;
  anchorId: string;
  articleNumber: string;
  articleTitle: string;
  changeType: ChangeType;
}

interface Props {
  items: TreeItem[];
}

const SYMBOL: Record<ChangeType, string> = {
  added: "＋",
  modified: "～",
  deleted: "－",
  moved: "↔",
};

// 4-타입 색 클래스 — tailwind change.* 토큰 재사용 (R17 팔레트).
// 색을 빼면 4종을 가르는 게 기호뿐이었다(평가 실측: 목차 칩의 테두리가
// 4종 모두 동일한 2px solid). 테두리 굵기·선종류를 타입마다 다르게 줘서
// 흑백에서도 형태로 구분되게 한다.
//   신설 굵은 실선 / 수정 실선 / 삭제 점선 얇게 / 이동 파선
const CHIP_CLS: Record<ChangeType, string> = {
  added:
    "bg-change-addedPanel text-change-addedText border-2 border-change-addedMark",
  modified:
    "bg-change-modifiedPanel text-change-modifiedText border border-change-modifiedMark",
  deleted:
    "bg-change-deletedPanel text-change-deletedText border border-dotted border-change-deletedMark",
  moved:
    "bg-change-movedPanel text-change-movedText border border-dashed border-change-movedMark",
};

export function DiffTreeNav({ items }: Props) {
  // 라운드 27: 스크롤 스파이 로직을 useScrollSpy 훅으로 통일.
  // (R24 rAF 스로틀 · R25 settle timer + hashchange 를 훅에 흡수)
  const anchorIds = useMemo(() => items.map((it) => it.anchorId), [items]);
  const activeAnchor = useScrollSpy(anchorIds);
  const activeKey = items.find((it) => it.anchorId === activeAnchor)?.articleKey ?? null;

  if (items.length === 0) return null;

  // 개수 요약
  const counts = items.reduce<Record<ChangeType, number>>(
    (acc, it) => {
      acc[it.changeType] = (acc[it.changeType] ?? 0) + 1;
      return acc;
    },
    { added: 0, modified: 0, deleted: 0, moved: 0 },
  );

  return (
    <>
      {/* 좁은 화면(lg 미만)용 접이식 목차. 조문 전문 목차와 같은 규칙. */}
      <details className="group mb-4 rounded-md border border-line bg-surface lg:hidden">
        <DisclosureSummary label="변경된 조문" count={items.length} />
        <ul className="max-h-80 space-y-0.5 overflow-y-auto border-t border-line px-4 py-3 scrollbar-thin">
          {items.map((it) => (
            <li key={it.articleKey}>
              <a
                href={`#${it.anchorId}`}
                className="block truncate rounded px-1.5 py-1 text-sm text-fg-secondary hover:bg-hover hover:text-fg"
              >
                {it.articleNumber}
                {it.articleTitle ? ` · ${it.articleTitle}` : ""}
              </a>
            </li>
          ))}
        </ul>
      </details>

      <aside className="hidden w-60 flex-shrink-0 lg:block">
      <nav
        aria-label="변경 조문 목차"
        className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 scrollbar-thin"
      >
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
          변경 조문 목차
        </div>
        <div className="mb-4 text-xs text-fg-secondary">
          총 {items.length}건
          {counts.added > 0 && <> · <span className="text-success">신설 {counts.added}</span></>}
          {counts.modified > 0 && <> · <span className="text-warning">수정 {counts.modified}</span></>}
          {counts.deleted > 0 && <> · <span className="text-fg-muted">삭제 {counts.deleted}</span></>}
          {counts.moved > 0 && <> · <span className="text-info">이동 {counts.moved}</span></>}
        </div>
        <ul className="space-y-0.5">
          {items.map((it) => {
            const isActive = activeKey === it.articleKey;
            return (
              <li key={it.articleKey}>
                <a
                  href={`#${it.anchorId}`}
                  className={
                    "group flex items-start gap-2 border-l-2 py-1.5 pl-2 pr-1 text-xs transition-colors duration-swift ease-swift " +
                    (isActive
                      ? "border-l-primary bg-primary-subtle/60 text-fg font-semibold"
                      : "border-l-transparent text-fg hover:bg-hover hover:border-l-rule")
                  }
                >
                  <span
                    aria-hidden="true"
                    className={`mt-[1px] inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-sm text-xs font-medium ${CHIP_CLS[it.changeType]}`}
                  >
                    {SYMBOL[it.changeType]}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{it.articleNumber}</span>
                    {it.articleTitle && (
                      <span className="text-fg-secondary"> · {it.articleTitle}</span>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      </aside>
    </>
  );
}
