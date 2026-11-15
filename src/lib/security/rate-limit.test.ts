import { describe, expect, it } from "vitest";
import { getClientIp, takeRateLimit } from "./rate-limit";

// 각 테스트마다 다른 key 를 써서 서로 간섭 안 되게 (in-memory 는 process 공유이므로).

describe("takeRateLimit", () => {
  it("limit 이하 요청은 모두 allowed=true", () => {
    const k = `t1_${Math.random()}`;
    for (let i = 0; i < 3; i += 1) {
      const r = takeRateLimit({ key: k, limit: 3, windowMs: 60_000 });
      expect(r.allowed).toBe(true);
    }
  });

  it("limit 초과 시 allowed=false, retryAfter > 0", () => {
    const k = `t2_${Math.random()}`;
    for (let i = 0; i < 5; i += 1) takeRateLimit({ key: k, limit: 5, windowMs: 60_000 });
    const r = takeRateLimit({ key: k, limit: 5, windowMs: 60_000 });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("remaining 이 정확히 감소", () => {
    const k = `t3_${Math.random()}`;
    const r1 = takeRateLimit({ key: k, limit: 3, windowMs: 60_000 });
    expect(r1.remaining).toBe(2);
    const r2 = takeRateLimit({ key: k, limit: 3, windowMs: 60_000 });
    expect(r2.remaining).toBe(1);
    const r3 = takeRateLimit({ key: k, limit: 3, windowMs: 60_000 });
    expect(r3.remaining).toBe(0);
  });

  it("서로 다른 key 는 독립", () => {
    const k1 = `t4a_${Math.random()}`;
    const k2 = `t4b_${Math.random()}`;
    takeRateLimit({ key: k1, limit: 1, windowMs: 60_000 });
    const r2 = takeRateLimit({ key: k2, limit: 1, windowMs: 60_000 });
    expect(r2.allowed).toBe(true); // k1 소진해도 k2 는 별개
  });
});

describe("getClientIp", () => {
  it("x-forwarded-for 첫 IP 반환", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(h)).toBe("1.2.3.4");
  });

  it("x-forwarded-for 없으면 x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "10.0.0.1" });
    expect(getClientIp(h)).toBe("10.0.0.1");
  });

  it("둘 다 없으면 'unknown'", () => {
    const h = new Headers();
    expect(getClientIp(h)).toBe("unknown");
  });
});
