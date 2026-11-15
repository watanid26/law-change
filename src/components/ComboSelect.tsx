"use client";

// 라운드 30-4: 검색 가능 드롭다운. native <select> 는 옵션 20+ 부터 UX 붕괴.
// 소관부처(100+ 부처) · 문서 종류 등에 사용.
// - form 안에 hidden input 으로 값 전달 → 기존 <form action="/laws" method="get"> 그대로 작동
// - 타이핑 → 옵션 필터
// - 화살표/엔터 키보드 이동
// - 외부 클릭 · Esc 닫기

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

interface Props {
  name: string;
  value: string;
  placeholder: string;
  options: string[];
  className?: string;
  allowEmpty?: boolean; // true 면 "전체" 옵션 노출
}

export function ComboSelect({
  name,
  value,
  placeholder,
  options,
  className,
  allowEmpty = true,
}: Props) {
  const [current, setCurrent] = useState(value);
  // "필터 초기화" 후 URL·목록은 전체로 돌아왔는데 이 칸만 옛 값을 들고 있었다.
  // useState 의 인자는 첫 렌더에만 쓰이고, 클라이언트 내비게이션에서는 같은
  // 컴포넌트가 재사용되어 다시 반영되지 않는다.
  useEffect(() => {
    setCurrent(value);
  }, [value]);
  const [query, setQuery] = useState(""); // 검색어 (드롭다운 열린 상태에서만)
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = q
      ? options.filter((o) => o.toLowerCase().includes(q))
      : options;
    return items.slice(0, 200); // 안전 상한
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function select(v: string) {
    setCurrent(v);
    setOpen(false);
    setQuery("");
    // 고르면 바로 적용한다. 지금까지는 옵션을 골라도 목록이 그대로여서
    // "선택이 안 먹힌다" 고 읽혔고, 별도 버튼을 눌러야 한다는 안내도 없었다.
    // hidden input 은 이미 갱신됐지만 React 가 DOM 에 반영하는 건 렌더 뒤라
    // 다음 프레임에 제출한다.
    const form = wrapperRef.current?.closest("form");
    if (form) requestAnimationFrame(() => form.requestSubmit());
  }

  const displayLabel = current || placeholder;

  return (
    <div ref={wrapperRef} className="relative">
      {/* 실제 form 데이터로 전송되는 hidden input */}
      <input type="hidden" name={name} value={current} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        // R33 감사 #2: 트리거가 inline-block 이라 Tailwind preflight 의
        // `svg { display: block }` 때문에 셰브런이 라벨 아래 줄로 떨어졌다.
        // flex + justify-between 으로 정렬을 명시하고 아이콘은 shrink-0.
        className={
          className ??
          "flex h-10 w-auto min-w-[150px] max-w-[220px] items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-3 text-left text-base text-fg transition-colors duration-swift focus:border-primary focus:outline-none"
        }
      >
        <span className={`truncate ${current ? "text-fg" : "text-fg-muted"}`}>
          {displayLabel}
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className="shrink-0 text-fg-muted"
        />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-[260px] overflow-hidden rounded-md border border-line bg-surface shadow-popover">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[highlight]) select(filtered[highlight]);
              }
            }}
            placeholder="검색…"
            className="block w-full border-b border-line bg-canvas px-3 py-2 text-sm focus:outline-none"
          />
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-64 overflow-y-auto scrollbar-thin"
          >
            {allowEmpty && (
              <li>
                <button
                  type="button"
                  onClick={() => select("")}
                  className={
                    "w-full px-3 py-2 text-left text-sm " +
                    (current === "" ? "bg-selected font-semibold text-fg" : "text-fg hover:bg-hover")
                  }
                >
                  전체
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-fg-secondary">일치하는 항목 없음</li>
            ) : (
              filtered.map((opt, i) => {
                const isCurrent = opt === current;
                const isHi = i === highlight;
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      onClick={() => select(opt)}
                      onMouseEnter={() => setHighlight(i)}
                      className={
                        "w-full px-3 py-2 text-left text-sm " +
                        (isCurrent
                          ? "bg-selected font-semibold text-fg"
                          : isHi
                            ? "bg-subtle text-fg"
                            : "text-fg hover:bg-hover")
                      }
                    >
                      {opt}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
