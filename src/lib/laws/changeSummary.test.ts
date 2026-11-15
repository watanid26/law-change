import { describe, expect, it } from "vitest";
import { changeSummaryLabel, hasComparableChanges } from "./changeSummary";

describe("변경 요약 문구", () => {
  it("최초 수집은 '변경' 이 아니라 '조문 N개'", () => {
    // 비교할 이전 판이 없어 diff 가 없는데 "12개 조항 변경" 이라고 하면
    // 눌러 들어갔을 때 빈 화면을 만난다. 실측 15,402건이 이랬다.
    expect(changeSummaryLabel({ eventType: "FIRST_ISSUE", totalDiffCount: 12, hasPrevious: false }))
      .toBe("조문 12개");
    expect(hasComparableChanges({ eventType: "FIRST_ISSUE", totalDiffCount: 12, hasPrevious: false }))
      .toBe(false);
  });

  it("이전 판이 있는 제정 이벤트는 진짜 변경이다", () => {
    // 드물지만 있다(실측 120건). 이때는 diff 가 실제로 만들어진다.
    expect(changeSummaryLabel({ eventType: "FIRST_ISSUE", totalDiffCount: 3, hasPrevious: true }))
      .toBe("3개 조항 변경");
    expect(hasComparableChanges({ eventType: "FIRST_ISSUE", totalDiffCount: 3, hasPrevious: true }))
      .toBe(true);
  });

  it("개정은 그대로", () => {
    expect(changeSummaryLabel({ eventType: "REVISION", totalDiffCount: 5, hasPrevious: true }))
      .toBe("5개 조항 변경");
    expect(changeSummaryLabel({ eventType: "REVISION", totalDiffCount: 0, hasPrevious: true }))
      .toBe("본문 변경 없음");
  });

  it("최초 수집인데 조문이 0개면 그렇게 말한다", () => {
    expect(changeSummaryLabel({ eventType: "FIRST_ISSUE", totalDiffCount: 0, hasPrevious: false }))
      .toBe("조문 정보 없음");
  });
});
