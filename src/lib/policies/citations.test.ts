import { describe, expect, it } from "vitest";
import { extractPolicyCitations } from "./citations";

const titles = (t: string) => extractPolicyCitations(t).map((c) => c.normalizedTitle);
const labels = (t: string) =>
  extractPolicyCitations(t).map((c) => `${c.normalizedTitle} ${c.articleLabel ?? "-"}`);

describe("extractPolicyCitations", () => {
  it("「」 로 감싼 근거 법령과 조문을 뽑는다", () => {
    expect(labels("제18조(연장근로) 「근로기준법」 제53조에 따라 연장근로를 제한한다.")).toEqual([
      "근로기준법 제53조",
    ]);
  });

  it("괄호 없이 쓴 근거도 뽑는다", () => {
    expect(labels("산업안전보건법 제29조의 규정에 의하여 교육을 실시한다.")).toEqual([
      "산업안전보건법 제29조",
    ]);
  });

  it("조문 가지번호를 살린다", () => {
    expect(labels("「개인정보 보호법」 제39조의3에 따른 조치")).toEqual([
      "개인정보 보호법 제39조의3",
    ]);
  });

  it("사규가 자기를 가리키는 말은 근거가 아니다", () => {
    // "이 규정" 은 사규 자신이다. 법령으로 잡으면 전 사규가 서로 얽힌다.
    expect(titles("이 규정은 다음과 같이 정한다. 같은 법 제3조 참조.")).toEqual([]);
  });

  it("같은 법령이라도 조문이 다르면 다른 후보다", () => {
    expect(labels("「근로기준법」 제53조 및 「근로기준법」 제56조에 따라")).toEqual([
      "근로기준법 제53조",
      "근로기준법 제56조",
    ]);
  });

  it("조문을 특정한 후보가 앞에 온다", () => {
    const out = extractPolicyCitations("「고용정책 기본법」에 따라. 「근로기준법」 제53조.");
    expect(out[0].articleLabel).toBe("제53조");
    expect(out[1].articleLabel).toBeNull();
  });

  it("여러 번 인용된 법령을 세어 앞에 둔다", () => {
    const out = extractPolicyCitations(
      "「고용정책 기본법」 참조. 「남녀고용평등법」 참조. 「고용정책 기본법」 재참조.",
    );
    expect(out[0].normalizedTitle).toBe("고용정책 기본법");
    expect(out[0].count).toBe(2);
  });

  it("가운뎃점 표기가 달라도 법령 제목과 맞출 수 있게 정규화한다", () => {
    // 법령 DB 는 ㆍ(U+318D), 사규 문서는 ·(U+00B7) 를 쓰는 일이 흔하다.
    expect(titles("「학원의 설립ㆍ운영 및 과외교습에 관한 법률」 제3조")).toEqual(
      titles("「학원의 설립·운영 및 과외교습에 관한 법률」 제3조"),
    );
  });

  it("본문이 없으면 빈 배열", () => {
    expect(extractPolicyCitations(null)).toEqual([]);
    expect(extractPolicyCitations("")).toEqual([]);
    expect(extractPolicyCitations("근거 없는 평범한 문장입니다.")).toEqual([]);
  });
  it("조문 표현이 앞에 딸려 와도 법령명만 남긴다", () => {
    // 실제 사규 문장: "「근로기준법」 제53조 및 같은 법 제56조에 따라"
    // 괄호 없는 규칙이 "제53조 및 같은 법" 을 법령명으로 잡았다.
    expect(labels("「근로기준법」 제53조 및 같은 법 제56조에 따라")).toEqual([
      "근로기준법 제53조",
    ]);
  });

  it("문장 중간의 '같은 법' 도 걸러낸다", () => {
    expect(titles("법 제3조에 따르며 같은 법 제4조도 준용한다")).toEqual([]);
  });
});
