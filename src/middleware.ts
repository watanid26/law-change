import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/auth/supabase-middleware";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { getClientIp, takeRateLimit } from "@/lib/security/rate-limit";

// 두 축의 인증:
// - /admin/*  : 내부 관리자 HMAC 쿠키 (lawchange_admin)
// - /app/*    : Supabase Auth 세션 (사용자 화면)
// 각각 별도 세션 시스템 — 서로 간섭 없음.
//
// 추가로 민감 경로에 rate limit (in-memory sliding window).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req.headers);

  // ─── Rate limit ─────────────────────────────────────────
  const rl = checkRateLimit(pathname, ip);
  if (rl && !rl.allowed) {
    return new NextResponse(
      JSON.stringify({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfterSeconds),
        },
      },
    );
  }

  // ─── Auth 라우팅 ────────────────────────────────────────
  // Admin 라우트
  if (pathname.startsWith("/admin/login")) return NextResponse.next();
  if (pathname.startsWith("/admin")) {
    const cookie = req.cookies.get("lawchange_admin");
    if (!cookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // /app/* : Supabase 세션 refresh + 없으면 /login 으로.
  if (pathname.startsWith("/app")) {
    const { response, user } = await refreshSupabaseSession(req);
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", sanitizeNextPath(pathname));
      return NextResponse.redirect(url);
    }
    return response;
  }

  // /login, /auth/callback 세션 쿠키 refresh
  if (pathname.startsWith("/login") || pathname.startsWith("/auth/")) {
    const { response } = await refreshSupabaseSession(req);
    return response;
  }

  return NextResponse.next();
}

// 경로별 rate limit 정책. 없으면 rate limit 없음.
function checkRateLimit(pathname: string, ip: string) {
  // 관리자 로그인 brute force 방어 — 5분 5회
  if (pathname === "/admin/login") {
    return takeRateLimit({ key: `admin-login:${ip}`, limit: 5, windowMs: 5 * 60_000 });
  }
  // Auth 콜백 — OAuth 재시도 대비 여유롭게
  if (pathname.startsWith("/auth/callback")) {
    return takeRateLimit({ key: `auth-callback:${ip}`, limit: 20, windowMs: 60_000 });
  }
  // 로그인 페이지 — 매직 링크 발송 남용 방지
  if (pathname === "/login") {
    return takeRateLimit({ key: `login-page:${ip}`, limit: 30, windowMs: 60_000 });
  }
  // Storage signed URL 발급 — 파일 업로드 남용 방지
  if (pathname.startsWith("/api/storage/")) {
    return takeRateLimit({ key: `storage:${ip}`, limit: 30, windowMs: 60_000 });
  }
  // Excel export — 대량 다운로드 남용 방지
  if (pathname.startsWith("/api/export/")) {
    return takeRateLimit({ key: `export:${ip}`, limit: 10, windowMs: 60_000 });
  }
  return null;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/app/:path*",
    "/login",
    "/auth/:path*",
    "/api/storage/:path*",
    "/api/export/:path*",
  ],
};
