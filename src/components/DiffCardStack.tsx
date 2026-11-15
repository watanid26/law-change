"use client";

// 개정 카드가 많은 법령(48건 관측)에서 페이지가 88,000px 넘게 길어졌다.
// 카드를 전부 한 번에 DOM 에 그리는 대신 처음 20건만 그리고 나머지는 요청할 때
// 펼친다. 목차·앵커·인쇄가 깨지면 안 되므로 다음 세 경우엔 자동으로 펼친다.
//   1) URL 해시가 아직 안 그려진 카드를 가리킬 때 (목차에서 아래쪽 조문 클릭)
//   2) 인쇄 직전 (beforeprint)
//   3) 사용자가 "나머지 N건 펼치기" 를 누를 때

import { Children, useCallback, useEffect, useState } from "react";

const INITIAL = 20;

export function DiffCardStack({ children }: { children: React.ReactNode }) {
  const items = Children.toArray(children);
  const [expanded, setExpanded] = useState(items.length <= INITIAL);
  const expand = useCallback(() => setExpanded(true), []);

  useEffect(() => {
    if (expanded) return;

    // 해시가 가리키는 카드가 아직 없으면 펼치고 나서 그리로 스크롤한다.
    // 펼친 직후엔 아직 DOM 에 없으므로 다음 프레임에 다시 찾는다.
    const jumpToHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id || document.getElementById(id)) return;
      setExpanded(true);
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView();
      });
    };

    jumpToHash();
    window.addEventListener("hashchange", jumpToHash);
    window.addEventListener("beforeprint", expand);
    return () => {
      window.removeEventListener("hashchange", jumpToHash);
      window.removeEventListener("beforeprint", expand);
    };
  }, [expanded, expand]);

  const shown = expanded ? items : items.slice(0, INITIAL);
  const hidden = items.length - shown.length;

  return (
    <>
      {shown}
      {hidden > 0 && (
        <button
          type="button"
          onClick={expand}
          className="w-full rounded-md border border-dashed border-line-strong bg-surface px-4 py-3 text-base font-medium text-fg-secondary transition-colors duration-swift hover:border-primary hover:text-primary print-hide"
        >
          나머지 개정 조문 {hidden}건 펼치기
        </button>
      )}
    </>
  );
}
