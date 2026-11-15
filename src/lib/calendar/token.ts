// 캘린더 구독 URL 토큰.
//
// 캘린더 앱(구글·아웃룩)은 세션 쿠키를 보내지 않는다. 그래서 구독 URL 자체가
// 인증 수단이 된다. DB 컬럼을 새로 만들지 않고 HMAC 으로 파생한다 —
// 마이그레이션 없이 되고, 서버 시크릿을 바꾸면 전체 폐기(rotate)도 된다.
//
// 토큰 = base64url(workspaceId) + "." + base64url(HMAC-SHA256(workspaceId, secret))
//
// 시크릿이 없으면 기능을 끈다. 약한 기본값으로 워크스페이스 일정을 노출하는
// 것보다 안 되는 게 낫다.

import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string | null {
  return process.env.CALENDAR_TOKEN_SECRET ?? process.env.CRON_SECRET ?? null;
}

export function isCalendarFeedEnabled(): boolean {
  return secret() !== null;
}

function sign(workspaceId: string, key: string): string {
  return createHmac("sha256", key).update(workspaceId).digest("base64url");
}

export function createCalendarToken(workspaceId: string): string | null {
  const key = secret();
  if (!key) return null;
  return `${Buffer.from(workspaceId).toString("base64url")}.${sign(workspaceId, key)}`;
}

/** 유효하면 workspaceId, 아니면 null. */
export function verifyCalendarToken(token: string): string | null {
  const key = secret();
  if (!key) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  let workspaceId: string;
  try {
    workspaceId = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!workspaceId) return null;

  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(workspaceId, key));
  // 길이가 다르면 timingSafeEqual 이 throw 하므로 먼저 확인한다.
  if (given.length !== want.length) return null;
  return timingSafeEqual(given, want) ? workspaceId : null;
}
