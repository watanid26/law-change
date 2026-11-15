// D-day 구간 회귀.
//
// "D-13이든 D-33이든 동일한 검정 계열" 이라는 지적을 받고 형태 구분을 넣었다.
// 구간이 늘어나거나 경계가 흔들리면 급박함이 다시 안 읽힌다.

import { describe, expect, it } from "vitest";
import { ddayTier } from "./dday";

describe("D-day 구간", () => {
  it("경계값", () => {
    expect(ddayTier(-1)).toBe("past");
    expect(ddayTier(0)).toBe("today");
    expect(ddayTier(1)).toBe("urgent");
    expect(ddayTier(7)).toBe("urgent");
    expect(ddayTier(8)).toBe("soon");
    expect(ddayTier(14)).toBe("soon");
    expect(ddayTier(15)).toBe("near");
    expect(ddayTier(30)).toBe("near");
    expect(ddayTier(31)).toBe("far");
  });

  it("지적된 값들이 실제로 갈린다", () => {
    // 평가자가 같은 색으로 봤다고 한 세 값.
    expect(ddayTier(13)).toBe("soon");
    expect(ddayTier(20)).toBe("near");
    expect(ddayTier(33)).toBe("far");
    expect(new Set([ddayTier(13), ddayTier(20), ddayTier(33)]).size).toBe(3);
  });

  it("시행일을 모르면 조용한 쪽으로 떨어진다", () => {
    expect(ddayTier(null)).toBe("far");
  });
});
