"use client";

// 라운드 18 T2: 조문 앵커 링크 복사 버튼. 심사평 "조문 헤딩에 id 속성 없어 위계가 보기용에
// 그치고 탐색용 기능 상실" 대응. #article-... 형태 fragment 를 클립보드로 복사해 공유 가능.

import { useState } from "react";

interface Props {
  anchorId: string;
  className?: string;
}

export function CopyAnchorButton({ anchorId, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${anchorId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 권한 없거나 iOS 예외 — 선택 링크 폴백 (window.location 만 변경)
      window.location.hash = anchorId;
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="이 조문 링크 복사"
      className={`inline-flex items-center gap-1 border border-transparent px-1.5 py-1 text-xs font-medium text-fg-muted hover:text-fg hover:border-line transition-colors duration-swift ease-swift ${className ?? ""}`}
    >
      {copied ? (
        <>
          <span aria-hidden="true">✓</span>
          <span>복사됨</span>
        </>
      ) : (
        <>
          <span aria-hidden="true">#</span>
          <span className="sr-only sm:not-sr-only">링크 복사</span>
        </>
      )}
    </button>
  );
}
