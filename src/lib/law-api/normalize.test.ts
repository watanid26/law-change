import { describe, expect, it } from "vitest";
import {
  assembleArticleText,
  computeDocumentHash,
  normalizeArticle,
  normalizeText,
  isSentinelDate,
  parseApiDate,
  resolveEffectiveDate,
  selectStorableArticles,
  sha256,
} from "./normalize";
import type { NormalizedArticle } from "./normalize";
import type { ArticleUnit } from "./types";

describe("parseApiDate", () => {
  it("정상 YYYYMMDD 파싱", () => {
    const d = parseApiDate("20260801");
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(7);
    expect(d!.getUTCDate()).toBe(1);
  });
  it("잘못된 값은 null", () => {
    expect(parseApiDate("")).toBeNull();
    expect(parseApiDate(undefined)).toBeNull();
    expect(parseApiDate("2026-08-01")).toBeNull(); // 하이픈 X
    expect(parseApiDate("abcd0101")).toBeNull();   // 숫자 아님
    expect(parseApiDate("1234567")).toBeNull();    // 7자
  });
});

describe("normalizeText", () => {
  it("HTML 태그·다중 공백·NBSP 제거", () => {
    const raw = 'Hello <b>world</b>&nbsp;&nbsp; multi   space';
    expect(normalizeText(raw)).toBe("Hello world multi space");
  });
  it("<개정 ...> 마커는 일반 태그로 취급되어 제거됨 (Diff 안정성)", () => {
    // 현재 구현은 OPENING_TAG 정규식이 <>로 감싸진 모든 것을 태그로 봄
    const raw = "제1조 목적 <개정 2020.2.4, 2023.3.14>";
    expect(normalizeText(raw)).toBe("제1조 목적");
    expect(normalizeText(raw, { stripRevisionMarkers: true })).toBe("제1조 목적");
  });
  it("CRLF → LF 정규화 + 다중 개행 축소", () => {
    const raw = "line1\r\n\r\n\r\n\r\nline2";
    expect(normalizeText(raw)).toBe("line1\n\nline2");
  });
});

describe("sha256", () => {
  it("동일 입력은 동일 해시", () => {
    const h1 = sha256("hello");
    const h2 = sha256("hello");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
  it("다른 입력은 다른 해시", () => {
    expect(sha256("hello")).not.toBe(sha256("hello!"));
  });
});

describe("assembleArticleText & normalizeArticle", () => {
  const article: ArticleUnit = {
    조문키: "0015000",
    조문번호: "15",
    조문제목: "개인정보의 수집·이용",
    조문내용: "제15조(개인정보의 수집·이용) ① 개인정보처리자는 다음 각 호의 어느 하나에 해당하는 경우에는... <개정 2020.2.4>",
    조문여부: "조문",
    조문시행일자: "20260101",
    항: {
      호: [
        { 호번호: "1.", 호내용: "1. 정보주체의 동의를 받은 경우" },
        { 호번호: "2.", 호내용: "2. 법률에 특별한 규정이 있거나" },
      ],
    },
  };

  it("assembleArticleText는 조문내용 + 호 + 목을 연결", () => {
    const text = assembleArticleText(article);
    expect(text).toContain("제15조");
    expect(text).toContain("1. 정보주체");
    expect(text).toContain("2. 법률");
  });

  it("항 배열 (①②③...) 이 있는 조문은 각 항내용을 모두 포함", () => {
    // 개인정보 보호법 제3조 실 구조 축소 재현: 조문내용은 헤더만, 항 배열에 실 본문.
    const art: ArticleUnit = {
      조문키: "0003001",
      조문번호: "3",
      조문제목: "개인정보 보호 원칙",
      조문내용: "제3조(개인정보 보호 원칙)",
      조문여부: "조문",
      항: [
        { 항번호: "①", 항내용: "① 개인정보처리자는 개인정보의 처리 목적을..." },
        { 항번호: "②", 항내용: "② 개인정보처리자는 처리 목적에 필요한 범위에서..." },
      ],
    };
    const text = assembleArticleText(art);
    expect(text).toContain("제3조");
    expect(text).toContain("① 개인정보처리자는 개인정보의 처리 목적을");
    expect(text).toContain("② 개인정보처리자는 처리 목적에 필요한 범위에서");
  });

  it("항 내부 중첩 호·목 도 재귀적으로 포함", () => {
    const art: ArticleUnit = {
      조문키: "0015001",
      조문번호: "15",
      조문제목: "개인정보의 수집·이용",
      조문내용: "제15조(개인정보의 수집·이용)",
      조문여부: "조문",
      항: [
        {
          항번호: "①",
          항내용: "① 개인정보처리자는 다음 각 호의 어느 하나에 해당하는 경우",
          호: [
            {
              호번호: "1.",
              호내용: "1. 정보주체의 동의를 받은 경우",
              목: [{ 목번호: "가.", 목내용: "가. 서면 동의" }],
            },
            { 호번호: "2.", 호내용: "2. 법률에 특별한 규정" },
          ],
        },
      ],
    };
    const text = assembleArticleText(art);
    expect(text).toContain("① 개인정보처리자는");
    expect(text).toContain("1. 정보주체의 동의를 받은 경우");
    expect(text).toContain("가. 서면 동의");
    expect(text).toContain("2. 법률에 특별한 규정");
  });

  it("normalizeArticle: articleKey/number/title/hash 채움", () => {
    const n = normalizeArticle(article, 0);
    expect(n.articleKey).toBe("0015000");
    expect(n.articleNumber).toBe("제15조");
    expect(n.articleTitle).toBe("개인정보의 수집·이용");
    expect(n.articleHash).toHaveLength(64);
    expect(n.isRealArticle).toBe(true);
    // stripRevisionMarkers 적용되어 <개정 …> 제거되어야 함
    expect(n.articleText).not.toContain("<개정");
  });

  it("가지번호 있으면 제N조의M 형식", () => {
    const withBranch: ArticleUnit = { ...article, 조문번호: "24", 조문가지번호: "2" };
    expect(normalizeArticle(withBranch, 0).articleNumber).toBe("제24조의2");
  });

  it("전문(장 헤더)은 isRealArticle=false", () => {
    const prelim: ArticleUnit = {
      조문키: "0001000",
      조문번호: "1",
      조문내용: "제1장 총칙",
      조문여부: "전문",
    };
    expect(normalizeArticle(prelim, 0).isRealArticle).toBe(false);
  });
});

describe("computeDocumentHash", () => {
  it("조문 순서에 의존, 실제 조문만 계산", () => {
    const a1 = normalizeArticle(
      { 조문키: "01", 조문번호: "1", 조문내용: "제1조", 조문여부: "조문" },
      0,
    );
    const a2 = normalizeArticle(
      { 조문키: "02", 조문번호: "2", 조문내용: "제2조", 조문여부: "조문" },
      1,
    );
    const preface = normalizeArticle(
      { 조문키: "P", 조문번호: "0", 조문내용: "제1장", 조문여부: "전문" },
      2,
    );
    const h1 = computeDocumentHash([a1, a2, preface]);
    const h2 = computeDocumentHash([a1, a2]); // preface 제외
    expect(h1).toBe(h2);
    const h3 = computeDocumentHash([a2, a1]); // 순서 뒤집기
    expect(h1).not.toBe(h3);
  });
});

describe("selectStorableArticles", () => {
  const mk = (over: Partial<NormalizedArticle>): NormalizedArticle => ({
    articleKey: "0001000", articleNumber: "제1조", articleTitle: null,
    articleText: "본문", articleHash: "h", articleOrder: 0, effectiveDate: null,
    isMovedFrom: null, isMovedTo: null, isRealArticle: true, ...over,
  });

  it("조문이 있으면 조문만 남기고 전문은 버린다", () => {
    const out = selectStorableArticles([
      mk({ articleNumber: "제1장", isRealArticle: false, articleText: "제1장 총칙" }),
      mk({ articleNumber: "제1조" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].articleNumber).toBe("제1조");
  });

  it("조문이 하나도 없으면 전문을 본문으로 쓴다", () => {
    const out = selectStorableArticles([
      mk({ articleNumber: "제0조", isRealArticle: false, articleText: "검찰청법은 폐지한다." }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].articleNumber).toBe("본문");
    expect(out[0].articleText).toBe("검찰청법은 폐지한다.");
  });

  it("전문이 빈 문자열뿐이면 아무것도 남기지 않는다", () => {
    expect(selectStorableArticles([mk({ isRealArticle: false, articleText: "   " })])).toEqual([]);
  });

  it("문서 hash 는 저장 단위와 같은 기준으로 계산된다", () => {
    const only전문 = [mk({ isRealArticle: false, articleText: "가", articleHash: "A" })];
    const 다른전문 = [mk({ isRealArticle: false, articleText: "나", articleHash: "B" })];
    expect(computeDocumentHash(only전문)).not.toBe(computeDocumentHash(다른전문));
  });
});

describe("resolveEffectiveDate — 시행일 자리표시 값", () => {
  const d = (s: string) => parseApiDate(s)!;

  it("정상 날짜는 그대로 둔다", () => {
    expect(resolveEffectiveDate(d("20260901"))).toEqual(d("20260901"));
    expect(resolveEffectiveDate(null)).toBeNull();
  });

  it("9999 는 자리표시로 본다", () => {
    expect(isSentinelDate(d("99990101"))).toBe(true);
    expect(isSentinelDate(d("99991231"))).toBe(true);
    expect(isSentinelDate(d("20991231"))).toBe(false);
  });

  it("조건부 시행(협정 발효일)은 미정으로 남긴다", () => {
    expect(
      resolveEffectiveDate(d("99990101"), {
        promulgationDate: d("20260430"),
        addendumText: "이 규칙은 아랍에미리트와의 협정 제18.4조에 따라 같은 협정이 발효되는 날부터 시행한다.",
      }),
    ).toBeNull();
  });

  it("부칙이 '고시한 날부터 시행'이면 발령일로 보정한다", () => {
    expect(
      resolveEffectiveDate(d("99991231"), {
        promulgationDate: d("20200708"),
        addendumText: "부칙 <제2008-29호,2008. 5. 28.> 제1조(시행일) 이 고시는 고시한 날부터 시행한다.",
      }),
    ).toEqual(d("20200708"));
  });

  it("부칙에 명시된 날짜가 있으면 그 날짜를 쓴다", () => {
    expect(
      resolveEffectiveDate(d("99990101"), {
        promulgationDate: d("20260101"),
        addendumText: "이 법은 2026년 7월 1일부터 시행한다.",
      }),
    ).toEqual(d("20260701"));
  });

  it("부칙이 없으면 미정으로 둔다 — 근거 없이 공포일로 밀지 않는다", () => {
    expect(resolveEffectiveDate(d("99990101"), { promulgationDate: d("20231128") })).toBeNull();
  });
});
