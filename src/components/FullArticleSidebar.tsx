"use client";

// 라운드 27: "조문 전문" 탭 좌측 목차 트리 (스크롤 스파이 지원).
// R25 이전엔 이 사이드바가 순수 <a href="#..."> 링크만이라 스크롤에 반응 못 함.
// (심사평: "제23조까지 스크롤해도 하이라이트 갱신 없음")
// DiffTreeNav 와 동일한 useScrollSpy 훅 사용으로 통일.

import { useMemo, useState } from "react";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { DisclosureSummary } from "./ui/DisclosureSummary";

export interface FullArticleSection {
  key: string;
  title: string | null;
  items: Array<{
    id: string;
    unitNumber: string | null;
    unitTitle: string | null;
  }>;
}

interface Props {
  sections: FullArticleSection[];
  latestVersionLabel: string;
}

export function FullArticleSidebar({ sections, latestVersionLabel }: Props) {
  // 모든 조문의 앵커 ID (섹션 순서 유지 · DOM 순서와 일치)
  const anchorIds = useMemo(
    () => sections.flatMap((s) => s.items.map((it) => `article-${it.id}`)),
    [sections],
  );
  const activeAnchor = useScrollSpy(anchorIds);

  // 조문이 150개 넘는 법령에서 목차를 스크롤로만 훑어야 했다. 다른 목록
  // 화면에는 모두 검색이 있는데 여기만 없어 일관성도 떨어졌다(사용성 평가).
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().replace(/\s+/g, "");
    if (!q) return sections;
    return sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((it) =>
          `${it.unitNumber ?? ""}${it.unitTitle ?? ""}`
            .replace(/\s+/g, "")
            .includes(q),
        ),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [sections, query]);
  const hitCount = filtered.reduce((n, s2) => n + s2.items.length, 0);

  const total = anchorIds.length;

  return (
    <>
      {/* 좁은 화면(lg 미만)용 접이식 목차.
          사용성 테스트: 978px 창에서 조문 75개짜리 법령을 열었는데 목차가
          `hidden lg:block` 이라 아예 안 보였고, 그런 기능이 있는지조차 알 수
          없어 끝까지 스크롤로만 찾아야 했다. 사이드바를 좁은 화면에 억지로
          밀어 넣는 대신 <details> 로 접어 둔다 — JS 없이 동작하고 키보드로도
          열린다. */}
      <details className="group mb-4 rounded-md border border-line bg-surface lg:hidden">
        <DisclosureSummary label="조문 목차" count={total} />
        <div className="max-h-80 overflow-y-auto border-t border-line px-4 py-3 scrollbar-thin">
          {filtered.map((section) => (
            <div key={section.key} className="mb-3 last:mb-0">
              {section.title ? (
                <div className="mb-1 text-sm font-medium text-fg-secondary">
                  {section.title}
                </div>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`#article-${a.id}`}
                      className="block truncate rounded px-1.5 py-1 text-sm text-fg-secondary hover:bg-hover hover:text-fg"
                    >
                      {a.unitNumber ?? ""}
                      {a.unitTitle ? ` · ${a.unitTitle}` : ""}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

      <aside className="hidden w-56 flex-shrink-0 lg:block">
      <nav
        aria-label="조문 목차"
        className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 scrollbar-thin"
      >
        <div className="mb-2 text-xs font-medium text-fg-muted">조문 목차</div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="조문 검색"
          aria-label="조문 검색"
          className="mb-2 h-8 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:outline-none"
        />
        <div className="mb-4 text-xs text-fg-secondary">{latestVersionLabel} 기준</div>
        {filtered.map((section) => (
          <div key={section.key} className="mb-4">
            {section.title && (
              <div className="mb-1.5 text-xs font-semibold text-fg">{section.title}</div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((a) => {
                const anchor = `article-${a.id}`;
                const isActive = activeAnchor === anchor;
                return (
                  <li key={a.id}>
                    <a
                      href={`#${anchor}`}
                      className={
                        "block truncate border-l-2 py-1 pl-2 pr-1 text-xs transition-colors duration-swift ease-swift " +
                        (isActive
                          ? "border-l-primary bg-primary-subtle/60 font-semibold text-fg"
                          : "border-l-transparent text-fg hover:bg-hover hover:border-l-rule hover:text-fg")
                      }
                    >
                      {a.unitNumber ?? ""}
                      {a.unitTitle ? (
                        <span className={isActive ? "text-fg" : "text-fg-secondary"}>
                          {" · "}
                          {a.unitTitle}
                        </span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {query && hitCount === 0 ? (
          <p className="text-sm text-fg-muted">일치하는 조문이 없습니다.</p>
        ) : null}
      </nav>
      </aside>
    </>
  );
}
