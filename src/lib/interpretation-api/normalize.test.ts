import { describe, expect, it } from "vitest";
import {
  computeInterpretationHash,
  extractCitedLawTitles,
  normalizeLawTitle,
  parseInterpretationDate,
} from "./normalize";
import type { InterpretationDetail } from "./types";

const base: InterpretationDetail = { 법령해석례일련번호: "1", 안건명: "" };

describe("parseInterpretationDate", () => {
  it("목록의 점 구분 형식과 상세의 8자리를 모두 읽는다", () => {
    expect(parseInterpretationDate("2005.12.23")).toEqual(new Date(Date.UTC(2005, 11, 23)));
    expect(parseInterpretationDate("20051223")).toEqual(new Date(Date.UTC(2005, 11, 23)));
  });
  it("빈 값과 형식이 깨진 값은 null", () => {
    for (const v of ["", "   ", undefined, null, "2005", "20051340"]) {
      expect(parseInterpretationDate(v as string)).toBeNull();
    }
  });
});

describe("normalizeLawTitle", () => {
  it("가운뎃점 표기가 달라도 같은 값이 된다", () => {
    // 법령 DB 는 ㆍ(U+318D), 해석례는 ·(U+00B7) 를 쓴다.
    expect(normalizeLawTitle("학원의 설립ㆍ운영 및 과외교습에 관한 법률")).toBe(
      normalizeLawTitle("학원의 설립·운영 및 과외교습에 관한 법률"),
    );
  });
  it("공백을 정리한다", () => {
    expect(normalizeLawTitle("  국가공무원법  ")).toBe("국가공무원법");
  });
});

describe("extractCitedLawTitles", () => {
  it("「」 안의 법령명을 뽑는다", () => {
    const d = { ...base, 안건명: "「국가공무원법」 제3조 관련", 이유: "「도로교통법 시행령」에 따라" };
    expect(extractCitedLawTitles(d).sort()).toEqual(["국가공무원법", "도로교통법 시행령"]);
  });
  it("조문이 붙어 있으면 법령명만 남긴다", () => {
    const d = { ...base, 안건명: "「국가공무원법 제3조제1항」" };
    expect(extractCitedLawTitles(d)).toEqual(["국가공무원법"]);
  });
  it("지시어와 법령이 아닌 인용은 버린다", () => {
    const d = { ...base, 안건명: "「같은 법 제3조」와 「별표 1」", 이유: "「질의요지」" };
    expect(extractCitedLawTitles(d)).toEqual([]);
  });
  it("같은 법령이 여러 번 나와도 한 번만 센다", () => {
    const d = { ...base, 안건명: "「도로교통법」", 이유: "「도로교통법」 제2조", 회답: "「도로교통법」" };
    expect(extractCitedLawTitles(d)).toEqual(["도로교통법"]);
  });
});

describe("computeInterpretationHash", () => {
  it("본문이 같으면 공백 차이는 무시한다", () => {
    const a = { ...base, 안건명: "가", 이유: "나  다" };
    const b = { ...base, 안건명: "가", 이유: "나 다" };
    expect(computeInterpretationHash(a)).toBe(computeInterpretationHash(b));
  });
  it("본문이 바뀌면 해시가 바뀐다", () => {
    const a = { ...base, 안건명: "가", 회답: "예" };
    const b = { ...base, 안건명: "가", 회답: "아니오" };
    expect(computeInterpretationHash(a)).not.toBe(computeInterpretationHash(b));
  });
});

describe("parseInterpretationDate — 한 자리 월·일", () => {
  it("2024.9.25. 처럼 자릿수가 안 맞는 값도 읽는다", () => {
    // 숫자만 뽑으면 7자리라 8자리 검사에서 탈락하던 값.
    expect(parseInterpretationDate("2024.9.25.")).toEqual(new Date(Date.UTC(2024, 8, 25)));
    expect(parseInterpretationDate("2005.1.5")).toEqual(new Date(Date.UTC(2005, 0, 5)));
  });
})
