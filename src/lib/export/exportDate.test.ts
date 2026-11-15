// 내보내기 표가 화면과 다른 말을 하지 않도록.
//
// 감사에 제출하는 표라 화면과 하루라도 어긋나면 안 된다. 예전에는
// 서버 지역시간(getFullYear 등)으로 날짜를 찍어서, UTC 서버에서는 한국시간
// 00~09시에 감지된 건이 하루 전으로 나갔다.

import { describe, expect, it } from "vitest";
import { formatExportDate } from "./exportDate";

describe("내보내기 날짜", () => {
  it("UTC 자정으로 저장된 공포일·시행일은 그 날짜 그대로", () => {
    expect(formatExportDate(new Date("2021-02-19T00:00:00.000Z"))).toBe("2021-02-19");
  });

  it("감지일처럼 실제 시각인 값은 한국 날짜로 찍는다", () => {
    // 한국시간 2026-08-27 09:00 — 서버가 UTC 면 예전 방식은 08-26 으로 찍혔다.
    expect(formatExportDate(new Date("2026-08-27T00:00:54.842Z"))).toBe("2026-08-27");
    // 한국시간 2026-08-20 02:00
    expect(formatExportDate(new Date("2026-08-19T17:00:54.842Z"))).toBe("2026-08-20");
  });

  it("빈 값은 빈 칸", () => {
    expect(formatExportDate(null)).toBe("");
  });
});
