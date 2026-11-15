// sanitizeNextPath 안전성 유닛 테스트 — Open Redirect 회귀 방지.

import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "./redirect";

describe("sanitizeNextPath", () => {
  it("null / undefined / 빈 문자열은 /app 로 fallback", () => {
    expect(sanitizeNextPath(null)).toBe("/app");
    expect(sanitizeNextPath(undefined)).toBe("/app");
    expect(sanitizeNextPath("")).toBe("/app");
  });

  it("허용: /app 및 /app/... same-origin 경로", () => {
    expect(sanitizeNextPath("/app")).toBe("/app");
    expect(sanitizeNextPath("/app/watches")).toBe("/app/watches");
    expect(sanitizeNextPath("/app/inbox?id=1")).toBe("/app/inbox?id=1");
    expect(sanitizeNextPath("/app/tasks/123")).toBe("/app/tasks/123");
    expect(sanitizeNextPath("/app#top")).toBe("/app#top");
  });

  it("차단: 외부 origin (scheme)", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/app");
    expect(sanitizeNextPath("http://evil.com")).toBe("/app");
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/app");
    expect(sanitizeNextPath("data:text/html,evil")).toBe("/app");
    expect(sanitizeNextPath("file:///etc/passwd")).toBe("/app");
  });

  it("차단: protocol-relative", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/app");
    expect(sanitizeNextPath("///evil.com")).toBe("/app");
    expect(sanitizeNextPath("/\\evil.com")).toBe("/app");
    expect(sanitizeNextPath("/\\\\evil.com")).toBe("/app");
  });

  it("차단: /app 이외의 route", () => {
    expect(sanitizeNextPath("/admin")).toBe("/app");
    expect(sanitizeNextPath("/admin/collector")).toBe("/app");
    expect(sanitizeNextPath("/auth/callback?code=x")).toBe("/app");
    expect(sanitizeNextPath("/login")).toBe("/app");
    expect(sanitizeNextPath("/")).toBe("/app");
    expect(sanitizeNextPath("/laws")).toBe("/app");
  });

  it("차단: 상대 경로 / 문자만", () => {
    expect(sanitizeNextPath("app")).toBe("/app");
    expect(sanitizeNextPath("app/watches")).toBe("/app");
    expect(sanitizeNextPath("../etc")).toBe("/app");
  });

  it("차단: encoded scheme 우회 시도", () => {
    // encode 된 //evil.com
    expect(sanitizeNextPath("%2f%2fevil.com")).toBe("/app");
    // encode 된 javascript:
    expect(sanitizeNextPath("javascript%3Aalert(1)")).toBe("/app");
    // 접두어만 /app 인 척
    expect(sanitizeNextPath("/appfake")).toBe("/app");
    expect(sanitizeNextPath("/app@evil.com")).toBe("/app");
  });

  it("완전히 잘못된 encoded 문자열은 안전하게 /app", () => {
    expect(sanitizeNextPath("%")).toBe("/app");
    expect(sanitizeNextPath("%zz")).toBe("/app");
  });

  // Round 5.1.2 — URL canonicalization
  it("차단: dot-segment path traversal", () => {
    expect(sanitizeNextPath("/app/../admin")).toBe("/app");
    expect(sanitizeNextPath("/app/../auth/callback")).toBe("/app");
    expect(sanitizeNextPath("/app/a/../../admin")).toBe("/app");
    expect(sanitizeNextPath("/app/../../login")).toBe("/app");
    expect(sanitizeNextPath("/app/foo/bar/../../../admin")).toBe("/app");
  });

  it("차단: encoded dot-segment traversal", () => {
    expect(sanitizeNextPath("/app/%2e%2e/admin")).toBe("/app");
    expect(sanitizeNextPath("/app/%2E%2E/admin")).toBe("/app");
    expect(sanitizeNextPath("/app/%2e%2e/%2e%2e/admin")).toBe("/app");
    expect(sanitizeNextPath("/app/a/%2E%2E/%2E%2E/login")).toBe("/app");
  });

  it("차단: 백슬래시 우회", () => {
    expect(sanitizeNextPath("\\evil")).toBe("/app");
    expect(sanitizeNextPath("/app\\..\\admin")).toBe("/app");
  });

  it("허용: canonicalize 후에도 /app scope 유지", () => {
    // WHATWG URL 파서는 중복 슬래시를 축약하지 않지만 same-origin /app scope 이므로 안전.
    expect(sanitizeNextPath("/app//watches")).toBe("/app//watches");
    // 현재 위치 dot 는 canonicalize 로 제거
    expect(sanitizeNextPath("/app/./watches")).toBe("/app/watches");
  });

  it("query/hash 는 보존", () => {
    expect(sanitizeNextPath("/app/watches?status=active&owner=me")).toBe("/app/watches?status=active&owner=me");
    expect(sanitizeNextPath("/app/inbox#item-5")).toBe("/app/inbox#item-5");
    expect(sanitizeNextPath("/app/tasks/123?tab=evidence#top")).toBe("/app/tasks/123?tab=evidence#top");
  });
});
