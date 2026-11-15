// 관리자 / 크론 인증 헬퍼
// - Cron: Vercel Cron이 자동으로 붙이는 `Authorization: Bearer $CRON_SECRET` 헤더 검증
// - Admin UI: `lawchange_admin` 쿠키에 HMAC 서명한 세션 토큰
// - Admin API: 위 쿠키 or `X-Admin-Secret` 헤더

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ADMIN_COOKIE = "lawchange_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// ────────── Cron ──────────
export function requireCronAuth(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// ────────── Admin ──────────
export interface AdminSession {
  ok: boolean;
  reason?: "no_secret_configured" | "no_cookie" | "invalid_signature" | "expired";
}

// 서명된 세션 토큰 발급: base64url( expMs ).base64url( hmacSHA256(secret, expMs) )
export function issueAdminSessionToken(secret: string, ttlMs: number = SESSION_TTL_MS): string {
  const exp = String(Date.now() + ttlMs);
  const sig = createHmac("sha256", secret).update(exp).digest("base64url");
  return `${Buffer.from(exp).toString("base64url")}.${sig}`;
}

function verifyAdminSessionToken(token: string, secret: string): AdminSession {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid_signature" };
  const [expB64, sig] = parts;
  let expStr: string;
  try {
    expStr = Buffer.from(expB64, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
  const expected = createHmac("sha256", secret).update(expStr).digest("base64url");
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return { ok: false, reason: "invalid_signature" };
  }
  const expMs = Number(expStr);
  if (!Number.isFinite(expMs) || expMs < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export function checkAdminSession(): AdminSession {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return { ok: false, reason: "no_secret_configured" };
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return { ok: false, reason: "no_cookie" };
  return verifyAdminSessionToken(token, secret);
}

// Server Action 진입시 사용 — 실패면 리다이렉트 or throw
export function assertAdmin(): void {
  const session = checkAdminSession();
  if (!session.ok) {
    throw new Error(`ADMIN_AUTH_REQUIRED:${session.reason ?? "unknown"}`);
  }
}

// Password 검증 — 로그인 폼에서 사용
export function verifyAdminPassword(input: string): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  if (input.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(input), Buffer.from(secret));
}

export const ADMIN_COOKIE_NAME = ADMIN_COOKIE;
export const ADMIN_SESSION_TTL_MS = SESSION_TTL_MS;
