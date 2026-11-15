"use client";

// 라운드 27: 스크롤 위치 → 현재 활성 앵커 감지 훅.
// 두 개의 목차 컴포넌트(DiffTreeNav, ArticleFullView 사이드바)가 각기 다른
// 로직으로 구현돼 있어 하나만 고치는 회귀 사고 재발 방지 위해 공용화.
//
// 사용:
//   const activeAnchor = useScrollSpy(anchorIds, { offset: 120 });
//
// 특징:
// - rAF 스로틀 + 100ms settle timer (마지막 프레임 보정 · R25 개선)
// - hashchange 리스너 (앵커 클릭 시 즉시 갱신)
// - resize 대응
// - DOM 캐시 (앵커 목록 변경 시에만 재조회)

import { useEffect, useState } from "react";

interface Options {
  /** 뷰포트 상단에서 이 픽셀 아래를 "현재 위치" 기준선으로. 기본 120. */
  offset?: number;
}

export function useScrollSpy(anchorIds: string[], options: Options = {}): string | null {
  const { offset = 120 } = options;
  const [activeId, setActiveId] = useState<string | null>(null);

  // anchorIds 배열 참조가 매 렌더 새로 만들어지면 useEffect 가 재생성됨.
  // 안전하게 조인해 문자열 키로 dep 관리.
  const key = anchorIds.join("|");

  useEffect(() => {
    if (anchorIds.length === 0) return;

    const nodes = anchorIds
      .map((id) => ({ id, el: document.getElementById(id) }))
      .filter((x): x is { id: string; el: HTMLElement } => x.el !== null);
    if (nodes.length === 0) return;

    let rafId: number | null = null;
    let settleTimer: number | null = null;

    function pickActive() {
      rafId = null;
      let current: (typeof nodes)[number] | null = null;
      for (const n of nodes) {
        const top = n.el.getBoundingClientRect().top;
        if (top <= offset) current = n;
        else break; // 조문은 DOM 순서 = 스크롤 순서
      }
      const nextId = current ? current.id : nodes[0].id;
      setActiveId((prev) => (prev === nextId ? prev : nextId));
    }

    function onScroll() {
      if (rafId === null) rafId = requestAnimationFrame(pickActive);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(pickActive, 100);
    }

    pickActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("hashchange", pickActive);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("hashchange", pickActive);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, offset]);

  return activeId;
}
