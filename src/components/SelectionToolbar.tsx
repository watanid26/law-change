"use client";

// 라운드 20 + 23 B2: 텍스트 선택 시 나타나는 플로팅 툴바.
// 라운드 23 수정: 버튼 클릭 시 selection 이 collapse 되면서 selectedText 상태가
// 비워지는 경합 상태 해결 — mousedown 에서 스냅샷을 먼저 잡아 클릭 시 그 값만 사용.

import { useEffect, useRef, useState } from "react";

interface Pos { top: number; left: number }
interface Snapshot { text: string; anchorId: string; label: string; url: string }

export function SelectionToolbar() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [copied, setCopied] = useState<"text" | "quote" | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleSelectionChange() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        // 툴바 위에서 mousedown 중이면 스냅샷을 보존 — snapshotRef 는 그대로 두고 위치만 숨김.
        // (다른 곳 클릭이면 아래 mousedown-outside 로 완전 초기화)
        return;
      }
      const text = selection.toString().trim();
      if (text.length < 2) {
        setPos(null);
        return;
      }
      const anchorEl = selection.anchorNode?.parentElement;
      const insideArticle = anchorEl?.closest('section[id^="article-"]');
      if (!insideArticle) {
        setPos(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const articleSection = insideArticle as HTMLElement;
      const anchorId = articleSection.id;
      const url = anchorId
        ? `${window.location.origin}${window.location.pathname}${window.location.search}#${anchorId}`
        : window.location.href;
      const articleHeader = articleSection.querySelector("h3");
      const label = articleHeader?.textContent?.trim() ?? "";
      // 스냅샷은 useRef 로 저장 → 이후 mousedown/click 사이 selection 이 사라져도 값 유지
      snapshotRef.current = { text, anchorId, label, url };
      setPos({
        top: rect.top + window.scrollY - 44,
        left: rect.left + window.scrollX + rect.width / 2,
      });
      setCopied(null);
    }
    document.addEventListener("mouseup", handleSelectionChange);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("mouseup", handleSelectionChange);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  // 툴바 밖에서 mousedown 하면 툴바를 닫고 스냅샷도 초기화.
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (!barRef.current) return;
      if (barRef.current.contains(e.target as Node)) return;
      // article 안 mousedown 은 새 selection 시작이므로 selectionchange 가 알아서 처리.
      // article 밖(빈 여백 등) mousedown 만 강제로 툴바 숨김.
      const isInArticle = (e.target as HTMLElement | null)?.closest?.('section[id^="article-"]');
      if (!isInArticle) {
        setPos(null);
        snapshotRef.current = null;
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPos(null);
        snapshotRef.current = null;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function copyText() {
    const snap = snapshotRef.current;
    if (!snap || !snap.text) return;
    try {
      await navigator.clipboard.writeText(snap.text);
      setCopied("text");
      setTimeout(() => setCopied(null), 1400);
    } catch { /* noop */ }
  }

  async function copyAsQuote() {
    const snap = snapshotRef.current;
    if (!snap || !snap.text) return;
    const quoted = snap.label
      ? `> ${snap.text}\n\n— ${snap.label} · ${snap.url}`
      : `> ${snap.text}\n\n${snap.url}`;
    try {
      await navigator.clipboard.writeText(quoted);
      setCopied("quote");
      setTimeout(() => setCopied(null), 1400);
    } catch { /* noop */ }
  }

  if (!pos) return null;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="선택 텍스트 액션"
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        transform: "translateX(-50%)",
      }}
      className="z-30 flex items-center gap-0.5 border border-line-strong bg-surface text-xs font-medium "
      // mousedown preventDefault 로 focus/selection 유지 시도
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={copyText}
        className="px-3 py-1.5 text-fg hover:bg-hover transition-colors duration-swift ease-swift"
      >
        {copied === "text" ? "✓ 복사됨" : "텍스트 복사"}
      </button>
      <span aria-hidden="true" className="h-4 w-px bg-line" />
      <button
        type="button"
        onClick={copyAsQuote}
        className="px-3 py-1.5 text-fg hover:bg-hover transition-colors duration-swift ease-swift"
      >
        {copied === "quote" ? "✓ 복사됨" : "인용 + 링크 복사"}
      </button>
    </div>
  );
}
