// 행정규칙 수집 범위 정책.
//
// 화이트리스트 ["고시"] 하나 때문에 코퍼스의 57% 가 조용히 빠져 있었다.
// 같은 사고가 다시 나지 않도록, 정책의 방향(모르면 받는다)과 제외 목록을
// 여기서 못박는다.

import { describe, expect, it } from "vitest";
import {
  EXCLUDED_ADMIN_RULE_KINDS,
  isCollectableAdminRuleKind,
} from "./adminRuleKinds";

describe("행정규칙 수집 범위", () => {
  it("표본에서 조문 구조가 확인된 종류는 전부 받는다", () => {
    for (const kind of [
      "고시", "훈령", "예규", "내규", "규정", "규칙",
      "국무총리훈령", "대통령훈령", "지침", "세칙", "공고",
    ]) {
      expect(isCollectableAdminRuleKind(kind), kind).toBe(true);
    }
  });

  it("한 덩어리로만 들어오는 법원 계열 예규는 받지 않는다", () => {
    for (const kind of ["등기예규", "재판예규", "가족관계등록예규", "행정예규"]) {
      expect(isCollectableAdminRuleKind(kind), kind).toBe(false);
    }
  });

  it("모르는 종류는 받는다 — 빠뜨리는 쪽이 더 위험하다", () => {
    // 화이트리스트였을 때 법제처가 종류를 늘려도 조용히 누락됐다.
    expect(isCollectableAdminRuleKind("가칭신설규칙")).toBe(true);
    expect(isCollectableAdminRuleKind(null)).toBe(true);
    expect(isCollectableAdminRuleKind(undefined)).toBe(true);
    expect(isCollectableAdminRuleKind("")).toBe(true);
  });

  it("앞뒤 공백이 있어도 제외 판정이 흔들리지 않는다", () => {
    expect(isCollectableAdminRuleKind(" 등기예규 ")).toBe(false);
  });

  it("제외 목록은 법원 계열 예규 4종뿐이다", () => {
    // 이 목록이 늘어난다면 근거(표본 조사)가 함께 있어야 한다.
    expect([...EXCLUDED_ADMIN_RULE_KINDS].sort()).toEqual(
      ["가족관계등록예규", "등기예규", "행정예규", "재판예규"].sort(),
    );
  });
});
