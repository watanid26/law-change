"use client";

// 라운드 21 P1: PDF 저장 버튼. 별도 라이브러리 없이 브라우저 window.print() 사용.
// print @media 룰로 UI 크롬(nav/aside/button) 제거 → 본문만 A4 로 출력.
// 사용자가 "PDF 로 저장" 선택 시 다이얼로그에서 대상을 PDF 로 지정하면 됨.

import { Icon } from "./Icon";

export function ExportPdfButton({ label = "PDF 저장" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-base font-medium text-fg transition-colors duration-swift hover:bg-hover duration-swift ease-swift print-hide"
      title="브라우저 인쇄 다이얼로그 → 대상을 'PDF로 저장' 으로 설정"
    >
      <Icon name="file-text" size={14} />
      {label}
    </button>
  );
}
