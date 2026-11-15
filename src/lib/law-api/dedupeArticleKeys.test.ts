import { describe, expect, it } from "vitest";
import { dedupeArticleKeys } from "./dedupeArticleKeys";

const a = (articleKey: string, articleTitle: string | null) => ({ articleKey, articleTitle });

describe("조문 키 중복 갈라내기", () => {
  it("겹치지 않으면 키를 건드리지 않는다 — 기존 데이터와 호환", () => {
    const out = dedupeArticleKeys([a("0001000", "목적"), a("0002000", "정의")]);
    expect(out.map((x) => x.articleKey)).toEqual(["0001000", "0002000"]);
  });

  it("같은 조 번호가 두 번 나오면 제목으로 가른다", () => {
    // 실제 사례: 경인지방데이터청 공적심사규정 제5조(추천) + 제5조(심사)
    const out = dedupeArticleKeys([a("0005000", "추천"), a("0005000", "심사")]);
    expect(out.map((x) => x.articleKey)).toEqual(["0005000", "0005000~심사"]);
  });

  it("제목이 순번보다 안정적이다 — 순서가 바뀌어도 키가 따라간다", () => {
    const first = dedupeArticleKeys([a("0023000", "비상연락망"), a("0023000", "지침및매뉴얼")]);
    const swapped = dedupeArticleKeys([a("0023000", "지침및매뉴얼"), a("0023000", "비상연락망")]);
    // 두 번째로 밀린 쪽만 접미사를 받으므로 완전 동일하진 않지만,
    // 접미사에 제목이 들어가 어느 조문인지 식별된다.
    expect(first[1].articleKey).toContain("지침및매뉴얼");
    expect(swapped[1].articleKey).toContain("비상연락망");
  });

  it("제목까지 같으면 그때만 순번으로 떨어진다", () => {
    // 실제 사례: 예비타당성조사 운용지침 제27조(재검토기한) ×2
    const out = dedupeArticleKeys([a("0027000", "재검토기한"), a("0027000", "재검토기한")]);
    expect(out.map((x) => x.articleKey)).toEqual(["0027000", "0027000~재검토기한"]);
  });

  it("셋 이상 겹쳐도 전부 유일하다", () => {
    const out = dedupeArticleKeys([
      a("0009000", "같은제목"), a("0009000", "같은제목"), a("0009000", "같은제목"),
    ]);
    expect(new Set(out.map((x) => x.articleKey)).size).toBe(3);
  });

  it("제목이 없어도 유일하게 만든다", () => {
    const out = dedupeArticleKeys([a("0003000", null), a("0003000", null)]);
    expect(new Set(out.map((x) => x.articleKey)).size).toBe(2);
  });

  it("구분기호가 섞인 제목도 키로 쓸 수 있게 정리한다", () => {
    const out = dedupeArticleKeys([a("0011000", "가"), a("0011000", "지침ㆍ매뉴얼 (별표)")]);
    expect(out[1].articleKey).toBe("0011000~지침매뉴얼별표");
  });
});
