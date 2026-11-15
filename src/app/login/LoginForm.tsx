"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import { sanitizeNextPath } from "@/lib/auth/redirect";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const supabase = getBrowserSupabase();

  // 서버가 이미 sanitize 하지만 defense-in-depth
  const safeNext = sanitizeNextPath(next);
  const redirectTo = typeof window !== "undefined"
    ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    : "/auth/callback";

  async function handleGoogle() {
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) { setStatus("error"); setErrorMsg(error.message); }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) { setStatus("error"); setErrorMsg(error.message); return; }
    setStatus("sent");
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={handleGoogle}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-line-strong bg-surface text-base font-medium text-fg transition-colors duration-swift hover:bg-hover"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.28-1.93-6.14-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.86 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.68-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.68 2.84C6.72 7.31 9.14 5.38 12 5.38z"/>
        </svg>
        Google 로 계속하기
      </button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs text-fg-muted">또는</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleMagicLink} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-fg-secondary">
            이메일로 로그인 링크 받기
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "sending" || status === "sent"}
            placeholder="you@company.com"
            className="block h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled"
          />
        </label>
        <button
          type="submit"
          disabled={status === "sending" || status === "sent" || !email}
          className="h-11 w-full rounded-md bg-primary text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-disabled"
        >
          {status === "sending" ? "전송 중..." : status === "sent" ? "메일 확인" : "매직 링크 받기"}
        </button>
      </form>

      {status === "sent" && (
        <div role="status" className="rounded-md border border-success/25 bg-success-subtle px-4 py-3 text-sm text-success">
          {email} 로 로그인 링크를 보냈습니다. 메일함을 확인해주세요.
        </div>
      )}
      {errorMsg && status === "error" && (
        <p role="alert" className="text-sm text-danger">{errorMsg}</p>
      )}
    </div>
  );
}
