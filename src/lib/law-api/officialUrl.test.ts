import { describe, expect, it } from "vitest";
import { buildPublicOfficialUrl } from "./officialUrl";

describe("buildPublicOfficialUrl", () => {
  it("LAW: OC 파라미터를 포함하지 않아야 함", () => {
    const url = buildPublicOfficialUrl("LAW", "011357", "개인정보 보호법");
    expect(url).not.toMatch(/OC=/i);
    expect(url).toContain("011357");
    expect(url.startsWith("https://www.law.go.kr")).toBe(true);
  });

  it("ADMIN_RULE: OC 파라미터를 포함하지 않아야 함", () => {
    const url = buildPublicOfficialUrl("ADMIN_RULE", "97361");
    expect(url).not.toMatch(/OC=/i);
    expect(url).toContain("97361");
  });

  it("URL 인코딩 적용", () => {
    const url = buildPublicOfficialUrl("LAW", "id with space", "제목");
    expect(url).toContain("id%20with%20space");
  });
});
