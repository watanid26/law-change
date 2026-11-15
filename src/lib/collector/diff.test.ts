import { describe, expect, it } from "vitest";
import { diffArticles } from "./diff";
import type { NormalizedArticle } from "@/lib/law-api/normalize";

function makeArticle(overrides: Partial<NormalizedArticle> & { key: string; text: string }): NormalizedArticle {
  return {
    articleKey: overrides.key,
    articleNumber: overrides.articleNumber ?? `제${overrides.key}조`,
    articleTitle: overrides.articleTitle ?? null,
    articleText: overrides.text,
    articleHash: overrides.articleHash ?? overrides.text,
    articleOrder: overrides.articleOrder ?? 0,
    effectiveDate: overrides.effectiveDate ?? null,
    isMovedFrom: overrides.isMovedFrom ?? null,
    isMovedTo: overrides.isMovedTo ?? null,
    isRealArticle: true,
  };
}

describe("diffArticles", () => {
  it("동일한 조문은 diff 없음", () => {
    const before = [makeArticle({ key: "1", text: "a" })];
    const after = [makeArticle({ key: "1", text: "a" })];
    const { diffs, counts } = diffArticles(before, after);
    expect(diffs).toHaveLength(0);
    expect(counts).toEqual({ added: 0, modified: 0, deleted: 0, moved: 0 });
  });

  it("새로 추가된 조문은 ADDED", () => {
    const before: NormalizedArticle[] = [];
    const after = [makeArticle({ key: "1", text: "a" })];
    const { diffs, counts } = diffArticles(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].changeType).toBe("ADDED");
    expect(counts.added).toBe(1);
  });

  it("삭제된 조문은 DELETED", () => {
    const before = [makeArticle({ key: "1", text: "a" })];
    const after: NormalizedArticle[] = [];
    const { diffs, counts } = diffArticles(before, after);
    expect(diffs[0].changeType).toBe("DELETED");
    expect(counts.deleted).toBe(1);
  });

  it("본문 변경은 MODIFIED", () => {
    const before = [makeArticle({ key: "1", text: "old", articleHash: "h1" })];
    const after = [makeArticle({ key: "1", text: "new", articleHash: "h2" })];
    const { diffs, counts } = diffArticles(before, after);
    expect(diffs[0].changeType).toBe("MODIFIED");
    expect(counts.modified).toBe(1);
    expect(diffs[0].oldText).toBe("old");
    expect(diffs[0].newText).toBe("new");
  });

  it("이동 표시된 조문은 MOVED", () => {
    const before = [makeArticle({ key: "1", text: "a", articleHash: "h1", isMovedTo: "2" })];
    const after = [makeArticle({ key: "1", text: "b", articleHash: "h2", isMovedFrom: "2" })];
    const { diffs, counts } = diffArticles(before, after);
    expect(diffs[0].changeType).toBe("MOVED");
    expect(counts.moved).toBe(1);
  });

  it("공백만 다르면 hash가 같으면 변경 없음 판정", () => {
    // hash는 normalize 결과이므로, 여기선 hash를 명시적으로 같이 줌
    const before = [makeArticle({ key: "1", text: "same content", articleHash: "H" })];
    const after = [makeArticle({ key: "1", text: "same content ", articleHash: "H" })];
    const { diffs } = diffArticles(before, after);
    expect(diffs).toHaveLength(0);
  });

  it("MOVED 메타지만 본문이 '제N조 삭제' 로 바뀐 경우 DELETED 로 재분류", () => {
    // 이전 라운드 QA: 010146 제43조 케이스. 소스 API 는 MOVED 로 표시하지만
    // 실 본문은 "제43조 삭제 <YYYY. M. D.>" 뿐이면 사용자에게는 삭제로 보여야 한다.
    const before = [makeArticle({
      key: "43",
      articleNumber: "제43조",
      text: "제43조(무엇무엇) 원래 본문",
      articleHash: "h1",
      isMovedTo: "44",
    })];
    const after = [makeArticle({
      key: "43",
      articleNumber: "제43조",
      text: "제43조 삭제 <2020. 12. 31.>",
      articleHash: "h2",
      isMovedFrom: "44",
    })];
    const { diffs, counts } = diffArticles(before, after);
    expect(diffs[0].changeType).toBe("DELETED");
    expect(counts.deleted).toBe(1);
    expect(counts.moved).toBe(0);
  });

  it("MOVED 메타지만 본문에 옛 제목이 남은 삭제 조문도 DELETED", () => {
    // 라운드 6 QA: isDeletionMarker 가 "제43조(제목) 삭제" 형태를 놓치던 케이스.
    const before = [makeArticle({
      key: "43",
      articleNumber: "제43조",
      text: "제43조(무엇무엇) 원래 본문",
      articleHash: "h1",
      isMovedTo: "44",
    })];
    const after = [makeArticle({
      key: "43",
      articleNumber: "제43조",
      text: "제43조(무엇무엇) 삭제 <2020. 12. 31.>",
      articleHash: "h2",
      isMovedFrom: "44",
    })];
    const { diffs, counts } = diffArticles(before, after);
    expect(diffs[0].changeType).toBe("DELETED");
    expect(counts.deleted).toBe(1);
  });

  it("MOVED 메타 + 본문 정상 유지면 그대로 MOVED", () => {
    const before = [makeArticle({
      key: "43",
      articleNumber: "제43조",
      text: "제43조(제목) 조문 본문 유지",
      articleHash: "h1",
      isMovedTo: "44",
    })];
    const after = [makeArticle({
      key: "43",
      articleNumber: "제43조의2",
      text: "제43조의2(제목) 조문 본문 유지",
      articleHash: "h2",
      isMovedFrom: "44",
    })];
    const { diffs, counts } = diffArticles(before, after);
    expect(diffs[0].changeType).toBe("MOVED");
    expect(counts.moved).toBe(1);
  });
});
