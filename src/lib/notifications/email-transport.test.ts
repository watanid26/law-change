// 발송 경로가 없을 때의 처리.
//
// 예전에는 provider="console" 도 ok:true 를 돌려줘서 delivery 가 SENT 로
// 찍혔다. 그러면 나중에 SMTP 를 붙여도 그 알림들은 이미 "보냈다" 로 남아
// 영영 안 나간다. 운영에서 안 보낸 것을 보냈다고 기록하지 않는다는 규칙을
// 여기서 못박는다.

import { afterEach, describe, expect, it } from "vitest";
import { emailProviderInUse, sendEmail } from "./email-transport";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

// NODE_ENV 는 타입상 readonly 라 직접 대입이 막힌다. 테스트에서만 우회한다.
function setNodeEnv(v: string) {
  (process.env as Record<string, string>).NODE_ENV = v;
}

function clearProviders() {
  delete process.env.SMTP_HOST;
  delete process.env.RESEND_API_KEY;
}

describe("발송 경로 선택", () => {
  it("SMTP 가 있으면 SMTP — 도메인 인증 없이 오늘 바로 쓸 수 있는 경로", () => {
    clearProviders();
    process.env.SMTP_HOST = "smtp.gmail.com";
    expect(emailProviderInUse()).toBe("smtp");
  });

  it("SMTP 가 없고 Resend 만 있으면 Resend", () => {
    clearProviders();
    process.env.RESEND_API_KEY = "re_test";
    expect(emailProviderInUse()).toBe("resend");
  });

  it("둘 다 있으면 SMTP 를 쓴다 — 운영자가 일부러 넣은 쪽을 존중", () => {
    clearProviders();
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.RESEND_API_KEY = "re_test";
    expect(emailProviderInUse()).toBe("smtp");
  });

  it("아무것도 없으면 console", () => {
    clearProviders();
    expect(emailProviderInUse()).toBe("console");
  });
});

describe("경로가 없을 때", () => {
  it("운영에서는 보류한다 — 안 보낸 것을 보냈다고 하지 않는다", async () => {
    clearProviders();
    setNodeEnv("production");
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "<p>h</p>" });
    expect(r.ok).toBe(false);
    expect(r.held).toBe(true);
    expect(r.provider).toBe("console");
    expect(r.error).toContain("SMTP_HOST");
  });

  it("개발에서는 통과시킨다 — 로컬 큐가 영원히 재시도하지 않도록", async () => {
    clearProviders();
    setNodeEnv("development");
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "<p>h</p>" });
    expect(r.ok).toBe(true);
    expect(r.held).toBeUndefined();
  });
});
