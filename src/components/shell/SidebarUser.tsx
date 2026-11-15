"use client";

// 사이드바 하단 사용자 영역.
// 표시하는 값은 전부 세션에서 실제로 오는 것만 쓴다 (없는 정보를 만들지 않는다).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { Avatar } from "../ui";
import { cx } from "../ui/styles";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";

export function SidebarUser({
  name,
  email,
  workspaceName,
  workspaceType,
}: {
  name: string | null;
  email: string | null;
  workspaceName: string | null;
  workspaceType: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function logout() {
    setPending(true);
    try {
      // 브라우저 측 정리는 fire-and-forget. 서버 라우트가 진짜 세션 종료 담당.
      getBrowserSupabase()
        .auth.signOut()
        .catch((e) => console.warn("[logout browser]", e));
    } finally {
      window.location.assign("/logout");
    }
  }

  const primary = name ?? email ?? "사용자";
  // 이름이 있으면 두 번째 줄은 워크스페이스. 이름이 없으면 중복이라 생략.
  const secondary =
    name && workspaceName
      ? workspaceType === "PERSONAL"
        ? `${workspaceName} (개인)`
        : workspaceName
      : null;

  return (
    <div ref={ref} className="relative">
      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-1.5 w-full min-w-[200px] overflow-hidden rounded-md border border-line bg-surface py-1 shadow-popover"
        >
          {email ? (
            <p className="truncate px-3 py-2 text-sm text-fg-muted" title={email}>
              {email}
            </p>
          ) : null}
          <Link
            href="/app/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-base text-fg-secondary hover:bg-hover hover:text-fg"
          >
            <Icon name="settings" size={16} className="text-fg-muted" />
            설정
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            disabled={pending}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-base text-fg-secondary hover:bg-hover hover:text-fg disabled:opacity-60"
          >
            <Icon name="log-out" size={16} className="text-fg-muted" />
            {pending ? "로그아웃 중…" : "로그아웃"}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cx(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-swift",
          open ? "bg-hover" : "hover:bg-hover",
        )}
      >
        <Avatar name={primary} size={26} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base text-fg">{primary}</span>
          {secondary ? (
            <span className="block truncate text-xs text-fg-muted">{secondary}</span>
          ) : null}
        </span>
        <Icon name="chevron-up" size={14} className="shrink-0 text-fg-muted" />
      </button>
    </div>
  );
}
