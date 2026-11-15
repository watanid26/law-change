import { describe, expect, it } from "vitest";
import { extractCitedLawTitles, normalizeDecision, parseDecisionDate } from "./normalize";

describe("parseDecisionDate", () => {
  it("점 구분과 8자리를 모두 읽는다", () => {
    expect(parseDecisionDate("2020.10.28.")).toEqual(new Date(Date.UTC(2020, 9, 28)));
    expect(parseDecisionDate("20201028")).toEqual(new Date(Date.UTC(2020, 9, 28)));
  });
  it("빈 값·깨진 값은 null", () => {
    for (const v of ["", "  ", null, undefined, "2020", "20201340"]) {
      expect(parseDecisionDate(v)).toBeNull();
    }
  });
});

describe("normalizeDecision", () => {
  it("ppc 와 ftc 의 다른 필드 이름을 같은 자리로 모은다", () => {
    const ppc = normalizeDecision("PPC", "1189", {
      안건명: "「난민법 시행규칙」 개정안 평가",
      안건번호: "제2024-219-611호",
      의결일자: "2024.9.25.",
      주문: "원안 동의한다.",
      회의종류: "제 2 소 위 원 회",
      결정: "심의ㆍ의결",
    });
    const ftc = normalizeDecision("FTC", "18717", {
      사건명: "부당 표시 건",
      사건번호: "2024공정1234",
      결정일자: "20240925",
      주문: "시정명령을 부과한다.",
      회의종류: "전원회의",
      문서유형: "의결서",
    });
    expect(ppc.title).toBe("「난민법 시행규칙」 개정안 평가");
    expect(ppc.caseNumber).toBe("제2024-219-611호");
    expect(ppc.decisionType).toBe("심의ㆍ의결");
    expect(ftc.title).toBe("부당 표시 건");
    expect(ftc.caseNumber).toBe("2024공정1234");
    expect(ftc.decidedAt).toEqual(ppc.decidedAt);
  });

  it("이미지만 든 별지·주문은 본문으로 치지 않는다", () => {
    // ppc 별지의 30% 가 <img> 뿐이다. 태그를 걷으면 남는 게 없다.
    const d = normalizeDecision("PPC", "1", {
      안건명: "가",
      주문: '<img src="/LSW/flDownload.do?flSeq=1"></img>',
    });
    expect(d.disposition).toBeNull();
  });

  it("제목이 없어도 죽지 않는다", () => {
    expect(normalizeDecision("FTC", "1", {}).title).toBe("(제목 없음)");
  });

  it("본문이 같으면 해시가 같다", () => {
    const a = normalizeDecision("FTC", "1", { 사건명: "가", 이유: "나" });
    const b = normalizeDecision("FTC", "1", { 사건명: "가", 이유: "나" });
    expect(a.contentHash).toBe(b.contentHash);
  });
});

describe("extractCitedLawTitles", () => {
  it("「」 안의 법령명만 뽑고 가운뎃점을 정규화한다", () => {
    expect(
      extractCitedLawTitles(["「학원의 설립·운영 및 과외교습에 관한 법률」 제3조 위반"]),
    ).toEqual(["학원의 설립·운영 및 과외교습에 관한 법률"]);
  });
  it("지시어와 법령 아닌 인용은 버린다", () => {
    expect(extractCitedLawTitles(["「같은 법 제3조」", "「별지 1」"])).toEqual([]);
  });
});
