"use client";

// 모바일 드로어. 데스크톱 사이드바와 같은 SidebarNav 를 재사용한다.
//
// 오버레이는 반드시 <body> 직속으로 포털해서 그린다.
//
// 왜: 트리거 버튼이 sticky header 안에 있는데, 그 header 에는 backdrop-blur
// (= backdrop-filter)가 걸려 있다. CSS 스펙상 backdrop-filter/filter/transform/
// will-change 가 있는 조상은 position:fixed 자손의 containing block 이 된다.
// 그래서 오버레이를 header 자식으로 두면 `inset-0` 이 뷰포트가 아니라 높이
// 60px 짜리 header 를 기준으로 계산돼, 드로어가 59px 상자로 눌리고 내부 링크가
// 뒷페이지 위로 흘러넘쳐 글자가 겹쳐 보인다 (R33 감사 지적 #1).
//
// 포털로 옮기면 header 의 스타일이 어떻게 바뀌든 오버레이가 영향받지 않는다.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { iconButtonClass } from "../ui/styles";
import { SidebarNav } from "./SidebarNav";
import { BrandLockup } from "../BrandMark";

export function MobileNav({ footer }: { footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // SSR 에는 document 가 없으므로 마운트 후에만 포털을 만든다.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // cleanup 시점에는 ref 가 이미 바뀌었을 수 있으므로 지금 값을 붙잡아 둔다.
    const trigger = triggerRef.current;

    // 열리면 패널로 포커스를 옮기고, 닫히면 트리거로 되돌린다.
    panelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      // 포커스 트랩 — 드로어 밖으로 Tab 이 새지 않게.
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open]);

  const overlay = (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="메뉴 닫기"
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="주 메뉴"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[264px] flex-col border-r border-line bg-surface focus:outline-none"
      >
        <div className="flex h-header shrink-0 items-center justify-between px-4">
          <BrandLockup />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="메뉴 닫기"
            className={iconButtonClass({ size: "sm" })}
          >
            <Icon name="chevron-right" size={18} className="rotate-180" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-line p-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={open}
        className={iconButtonClass({ size: "sm", className: "lg:hidden" })}
      >
        <Icon name="menu" size={18} />
      </button>

      {open && mounted ? createPortal(overlay, document.body) : null}
    </>
  );
}
