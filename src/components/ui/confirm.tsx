"use client";

// 확인 다이얼로그.
//
// 왜 만들었나: 파괴적 전환(검토 완료·삭제·관심 해제 등)에 window.confirm() 을
// 쓰고 있었다. 실사용자는 OS 다이얼로그를 보고 넘어가지만 문제가 세 가지였다.
//   1) 스타일을 못 입힌다. 업무용 화면 한가운데 OS 창이 뜬다.
//   2) 브라우저 자동화·E2E 가 여기서 멈춘다. 사용성 테스트에서 두 명의 리뷰어가
//      연속으로 "화면이 30초 이상 멈춘다"고 최고 심각도 버그로 보고했다.
//   3) 무엇이 일어나는지 본문에 길게 적을 수밖에 없어 문장이 늘어진다.
//
// 사용:
//   const confirm = useConfirm();
//   if (!(await confirm({ title: "...", body: "...", tone: "danger" }))) return;

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { buttonClass, cx } from "./styles";

export interface ConfirmOptions {
  title: string;
  /** 무슨 일이 일어나는지. 되돌릴 수 있으면 그 사실을 여기 적는다. */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Provider 없이 쓰이면 조용히 통과시키지 않고 즉시 드러낸다.
    throw new Error("useConfirm 은 <ConfirmProvider> 안에서만 쓸 수 있습니다.");
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [mounted, setMounted] = useState(false);
  const resolverRef = useRef<Resolver | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const confirm = useCallback((next: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(next);
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    // 확인 버튼에 포커스를 두되, Enter 로 실수 확정되지 않게 취소가 기본 동작은 아니다.
    confirmBtnRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close(false);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      prevFocus?.focus();
    };
  }, [opts, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {mounted && opts
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <button
                type="button"
                aria-label="취소"
                tabIndex={-1}
                onClick={() => close(false)}
                className="absolute inset-0 bg-black/40"
              />
              <div
                ref={panelRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby={opts.body ? "confirm-body" : undefined}
                className="relative w-full max-w-[420px] rounded-lg border border-line bg-surface p-5 shadow-modal"
              >
                <h2
                  id="confirm-title"
                  className="text-lg font-semibold text-fg"
                >
                  {opts.title}
                </h2>
                {opts.body ? (
                  <p
                    id="confirm-body"
                    className="mt-2 text-base leading-relaxed text-fg-secondary"
                  >
                    {opts.body}
                  </p>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => close(false)}
                    className={buttonClass({ variant: "secondary" })}
                  >
                    {opts.cancelLabel ?? "취소"}
                  </button>
                  <button
                    ref={confirmBtnRef}
                    type="button"
                    onClick={() => close(true)}
                    className={buttonClass({
                      variant: opts.tone === "danger" ? "danger" : "primary",
                    })}
                  >
                    {opts.confirmLabel ?? "확인"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ConfirmContext.Provider>
  );
}

export { cx };
