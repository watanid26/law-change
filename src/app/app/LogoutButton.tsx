"use client";

// 로그아웃 버튼.
// - 서버 라우트(/logout)로 form POST 해서 httpOnly 세션 쿠키까지 확실히 정리한다.
//   브라우저 supabase.auth.signOut() 만 호출하면 middleware 가 읽는 서버 쿠키가
//   남아 로그아웃 후에도 세션이 유지되는 케이스가 있었음 (QA 라운드 5).
// - 병렬로 브라우저 client 도 signOut 하여 로컬 storage 잔여 상태까지 정리.

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      // 브라우저 측 정리는 fire-and-forget. 서버 라우트가 진짜 세션 종료를 담당.
      const supabase = getBrowserSupabase();
      supabase.auth.signOut().catch((e) => console.warn("[logout browser]", e));
    } finally {
      // 서버 라우트로 이동해 쿠키 삭제 + / 로 리다이렉트.
      window.location.assign("/logout");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-swift hover:bg-hover disabled:opacity-50 transition-colors"
    >
      {pending ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
