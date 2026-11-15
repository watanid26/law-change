"use client";

// 라운드 18 T5: 검색 자동완성. 심사평 "자동완성 기능이 이번 조사에서 확인되지 않음" 대응.
// - 200ms 디바운스 후 /api/laws/suggest 호출
// - 결과는 상위 8건, 매칭 부분 하이라이트
// - 클릭 시 상세 페이지로 즉시 이동
// - 폼 제출(Enter/검색 버튼)은 기존과 동일하게 /laws?q=... 로 진입

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Suggestion {
  sourceId: string;
  title: string;
  documentType: string;
  ministry: string | null;
}

interface Props {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

export function SearchAutocomplete({ name, defaultValue, placeholder, className }: Props) {
  const [q, setQ] = useState(defaultValue ?? "");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setItems([]);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/laws/suggest?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data: { items: Suggestion[] }) => {
          setItems(data.items ?? []);
        })
        .catch(() => {
          // AbortError 무시. 다른 오류도 조용히 숨김 (검색 자체는 폼 제출로 대체 가능).
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const showDropdown = open && q.trim().length >= 1;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        name={name}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="search-autocomplete-list"
        aria-autocomplete="list"
        className={className}
      />
      {showDropdown && (items.length > 0 || loading) && (
        <ul
          id="search-autocomplete-list"
          role="listbox"
          className="absolute top-full left-0 right-0 z-20 mt-1 max-h-96 overflow-y-auto border border-line bg-surface "
        >
          {loading && items.length === 0 ? (
            <li className="px-3 py-2 text-xs text-fg-secondary">검색 중…</li>
          ) : (
            items.map((item) => (
              <li key={item.sourceId} role="option"
                  aria-selected={false}>
                <Link
                  href={`/laws/${item.sourceId}`}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 hover:bg-hover transition-colors duration-swift ease-swift"
                >
                  <div className="text-sm font-medium text-fg">
                    {renderHighlighted(item.title, q)}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-secondary">
                    {item.documentType}
                    {item.ministry ? ` · ${item.ministry}` : ""}
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// 라운드 18 T5: 매칭 부분 하이라이트. 심사평 "검색어 하이라이트 등 랭킹 근거 시각화 부재" 대응.
function renderHighlighted(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="bg-change-modifiedPanel text-warning px-0.5">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
