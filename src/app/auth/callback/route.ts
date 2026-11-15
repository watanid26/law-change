// OAuth / magic link 콜백 — Supabase 가 code 를 넘겨주면 session 으로 교환.
// 성공 시 origin + next 로 리다이렉트, 실패 시 /login?error 로.

import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/auth/supabase-server";
import { ensureAppUserFromSupabase, AuthProvisioningError } from "@/lib/auth/provision";
import { sanitizeNextPath } from "@/lib/auth/redirect";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const safeNext = sanitizeNextPath(nextParam);

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url));
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login?error=exchange_failed", url));
  }

  // 첫 로그인 시 provisioning warm-up.
  // - 성공: 다음 요청부터 즉시 domain context 확보
  // - AuthProvisioningError (예: soft-deleted 계정 재로그인): 명시적 로그아웃 후 안내
  // - 그 외 예외: 세션은 유지하되 다음 요청이 재시도 (경계 로그만)
  try {
    await ensureAppUserFromSupabase(data.user);
  } catch (err) {
    if (err instanceof AuthProvisioningError) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL(`/login?error=${err.code}`, url));
    }
    console.error("[auth/callback] provisioning failed:", { code: (err as Error).name });
    // 세션 유지 — 다음 요청에서 재시도됨
  }

  return NextResponse.redirect(new URL(safeNext, url));
}
