import { describe, expect, it } from "vitest";
import {
  computeAdminRuleDocumentHash,
  extractEffectiveDate,
  extractAdminRuleArticleTexts,
  normalizeAdminRuleArticles,
} from "./normalize";

describe("normalizeAdminRuleArticles", () => {
  it("헤더가 있는 조문들을 파싱", () => {
    const articles = normalizeAdminRuleArticles([
      "제1조(목적) 이 고시는 정보전송을 정한다.",
      "제2조(정의) 이 고시에서 사용하는 용어는 다음과 같다.",
      "제3조의2(전송 요구) 별표와 같다.",
    ]);
    expect(articles).toHaveLength(3);
    expect(articles[0].articleNumber).toBe("제1조");
    expect(articles[0].articleTitle).toBe("목적");
    expect(articles[2].articleNumber).toBe("제3조의2");
    expect(articles[2].articleTitle).toBe("전송 요구");
  });

  it("헤더 없는 이어지는 텍스트는 이전 조문에 합침", () => {
    const articles = normalizeAdminRuleArticles([
      "제1조(목적) 첫 부분.",
      "이어지는 두 번째 문단",
    ]);
    expect(articles).toHaveLength(1);
    expect(articles[0].articleText).toContain("첫 부분");
    expect(articles[0].articleText).toContain("이어지는");
  });

  it("빈 배열 처리", () => {
    expect(normalizeAdminRuleArticles(undefined)).toEqual([]);
    expect(normalizeAdminRuleArticles([])).toEqual([]);
  });

  it("문자열 단일 입력도 처리", () => {
    const articles = normalizeAdminRuleArticles("제1조(단독) 내용");
    expect(articles).toHaveLength(1);
    expect(articles[0].articleTitle).toBe("단독");
  });

  it("hash가 결정적으로 계산됨", () => {
    const a = normalizeAdminRuleArticles(["제1조(x) 내용"]);
    const b = normalizeAdminRuleArticles(["제1조(x) 내용"]);
    expect(a[0].articleHash).toBe(b[0].articleHash);
  });
});

describe("computeAdminRuleDocumentHash", () => {
  it("조문 목록 순서·해시가 반영됨", () => {
    const arts = normalizeAdminRuleArticles(["제1조(a) 1", "제2조(b) 2"]);
    const h1 = computeAdminRuleDocumentHash(arts);
    const h2 = computeAdminRuleDocumentHash(arts);
    expect(h1).toBe(h2);
    const reversed = [arts[1], arts[0]];
    expect(computeAdminRuleDocumentHash(reversed)).not.toBe(h1);
  });
});

describe("extractEffectiveDate", () => {
  it("부칙 텍스트에서 YYYY년 M월 D일 부터 시행 파싱", () => {
    const { date, text } = extractEffectiveDate({
      부칙공포일자: "20260601",
      부칙내용: "부칙 <제2026-8호, 2026. 6. 1.> 이 고시는 2026년 6월 1일부터 시행한다.",
    });
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(2026);
    expect(date!.getUTCMonth()).toBe(5); // June = 5
    expect(date!.getUTCDate()).toBe(1);
    expect(text).toContain("부칙");
  });

  it("파싱 실패해도 text는 보존, date는 null", () => {
    const { date, text } = extractEffectiveDate({
      부칙공포일자: "20260601",
      부칙내용: "일부 조문 별도 시행",
    });
    expect(date).toBeNull();
    expect(text).toBe("일부 조문 별도 시행");
  });

  it("undefined 부칙", () => {
    expect(extractEffectiveDate(undefined)).toEqual({ date: null, text: null });
  });
});

describe("extractAdminRuleArticleTexts", () => {
  it("고시·훈령: 최상위 조문내용 배열을 그대로 쓴다", () => {
    expect(
      extractAdminRuleArticleTexts({
        행정규칙기본정보: {} as never,
        조문내용: ["제1조(목적) a", "제2조(정의) b"],
      }),
    ).toEqual(["제1조(목적) a", "제2조(정의) b"]);
  });

  it("국무총리훈령·대통령훈령: 조문 블록 안의 조문내용을 꺼낸다", () => {
    expect(
      extractAdminRuleArticleTexts({
        행정규칙기본정보: {} as never,
        조문: { 조문번호: ["0001", "0002"], 조문내용: ["제1조(목적) a", "제2조(정의) b"] },
      }),
    ).toEqual(["제1조(목적) a", "제2조(정의) b"]);
  });

  it("조문 블록이 배열로 와도 이어붙인다", () => {
    expect(
      extractAdminRuleArticleTexts({
        행정규칙기본정보: {} as never,
        조문: [{ 조문내용: ["제1조 a"] }, { 조문내용: "제2조 b" }],
      }),
    ).toEqual(["제1조 a", "제2조 b"]);
  });

  it("최상위 조문내용이 있으면 조문 블록은 보지 않는다", () => {
    expect(
      extractAdminRuleArticleTexts({
        행정규칙기본정보: {} as never,
        조문내용: ["제1조 진짜"],
        조문: { 조문내용: ["제1조 가짜"] },
      }),
    ).toEqual(["제1조 진짜"]);
  });

  it("둘 다 없거나 빈 문자열뿐이면 빈 배열", () => {
    expect(extractAdminRuleArticleTexts(undefined)).toEqual([]);
    expect(
      extractAdminRuleArticleTexts({ 행정규칙기본정보: {} as never, 조문내용: ["", "  "] }),
    ).toEqual([]);
  });
});
