import { describe, expect, it } from "vitest";
import { issueAdminSessionToken, verifyAdminPassword } from "./auth";
import { createHmac } from "node:crypto";

// 시그니드 토큰 형식·검증을 테스트 (검증 함수는 내부용이므로 재구현으로 검사)
function verify(token: string, secret: string): { ok: boolean; reason?: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid_signature" };
  const [expB64, sig] = parts;
  const expStr = Buffer.from(expB64, "base64url").toString("utf8");
  const expected = createHmac("sha256", secret).update(expStr).digest("base64url");
  if (sig !== expected) return { ok: false, reason: "invalid_signature" };
  const expMs = Number(expStr);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true };
}

describe("issueAdminSessionToken", () => {
  it("정상 토큰은 검증 통과", () => {
    const secret = "test-secret-12345678";
    const token = issueAdminSessionToken(secret);
    expect(verify(token, secret).ok).toBe(true);
  });

  it("다른 시크릿으로는 검증 실패", () => {
    const token = issueAdminSessionToken("secret-A-XXXXXXXX");
    expect(verify(token, "secret-B-YYYYYYYY").ok).toBe(false);
  });

  it("만료 지난 토큰은 실패", () => {
    const secret = "test-secret-12345678";
    const token = issueAdminSessionToken(secret, -1000);
    expect(verify(token, secret).ok).toBe(false);
  });

  it("토큰이 조작되면 서명 실패", () => {
    const secret = "test-secret-12345678";
    const token = issueAdminSessionToken(secret);
    const tampered = token.slice(0, -1) + (token.slice(-1) === "A" ? "B" : "A");
    expect(verify(tampered, secret).ok).toBe(false);
  });
});

describe("verifyAdminPassword", () => {
  const originalSecret = process.env.ADMIN_SECRET;
  it("ADMIN_SECRET이 없으면 false", () => {
    delete process.env.ADMIN_SECRET;
    expect(verifyAdminPassword("anything")).toBe(false);
    if (originalSecret) process.env.ADMIN_SECRET = originalSecret;
  });
  it("일치하면 true, 아니면 false", () => {
    process.env.ADMIN_SECRET = "known-secret-abc";
    expect(verifyAdminPassword("known-secret-abc")).toBe(true);
    expect(verifyAdminPassword("wrong")).toBe(false);
    expect(verifyAdminPassword("known-secret-abx")).toBe(false);
    if (originalSecret) process.env.ADMIN_SECRET = originalSecret;
    else delete process.env.ADMIN_SECRET;
  });
});
