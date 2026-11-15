import { diffLines } from "diff";
import type { NormalizedArticle } from "@/lib/law-api/normalize";

// Schema v7: legal_diff.change_type 정규화 값
export type ArticleChangeType =
  | "ADDED"
  | "DELETED"
  | "MODIFIED"
  | "MOVED"
  | "TITLE_CHANGED";

export interface DiffOperation {
  type: "context" | "added" | "removed";
  text: string;
}

export interface ArticleDiff {
  articleKey: string;
  articleNumber: string;
  articleTitle: string | null;
  changeType: ArticleChangeType;
  oldText: string | null;
  newText: string | null;
  diffOperations: DiffOperation[];
}

export interface DocumentDiffResult {
  diffs: ArticleDiff[];
  counts: {
    added: number;
    modified: number;
    deleted: number;
    moved: number;
  };
}

// Schema v7 alias — 향후 부칙·별표까지 확장 시 이 함수를 확장.
// 지금은 조문(ARTICLE)만 처리.
export const diffContentUnits = diffArticles;

// 두 버전의 조문 목록을 비교해 diff 목록 반환
export function diffArticles(
  previous: NormalizedArticle[],
  next: NormalizedArticle[],
): DocumentDiffResult {
  const prevMap = new Map<string, NormalizedArticle>();
  for (const a of previous) {
    if (a.isRealArticle) prevMap.set(a.articleKey, a);
  }
  const nextMap = new Map<string, NormalizedArticle>();
  for (const a of next) {
    if (a.isRealArticle) nextMap.set(a.articleKey, a);
  }

  const diffs: ArticleDiff[] = [];
  const counts = { added: 0, modified: 0, deleted: 0, moved: 0 };

  // 신규 조문 + 수정된 조문
  for (const [key, current] of nextMap) {
    const before = prevMap.get(key);
    if (!before) {
      diffs.push({
        articleKey: key,
        articleNumber: current.articleNumber,
        articleTitle: current.articleTitle,
        changeType: "ADDED",
        oldText: null,
        newText: current.articleText,
        diffOperations: toDiffOps("", current.articleText),
      });
      counts.added += 1;
      continue;
    }

    if (before.articleHash === current.articleHash) continue;

    // 소스 API 메타데이터가 MOVED 라 해도, 새 본문이 "삭제" 표기(제N조 삭제 등)면
    // 실질적으로 삭제된 조문이다. 이전 라운드 QA 에서 010146 제43조가
    // "제43조 삭제" 본문인데 MOVED 로 분류되던 오분류 케이스를 여기서 방어한다.
    if (isDeletionMarker(current.articleText) && !isDeletionMarker(before.articleText)) {
      diffs.push({
        articleKey: key,
        articleNumber: current.articleNumber,
        articleTitle: current.articleTitle,
        changeType: "DELETED",
        oldText: before.articleText,
        newText: current.articleText, // "제N조 삭제" 자체를 새 본문으로 보관
        diffOperations: toDiffOps(before.articleText, current.articleText),
      });
      counts.deleted += 1;
      continue;
    }

    // 조문 이동 감지 (조문이동이후/이전 필드 활용) — 위 삭제 방어를 통과한 경우에만.
    if (current.isMovedFrom || before.isMovedTo) {
      diffs.push({
        articleKey: key,
        articleNumber: current.articleNumber,
        articleTitle: current.articleTitle,
        changeType: "MOVED",
        oldText: before.articleText,
        newText: current.articleText,
        diffOperations: toDiffOps(before.articleText, current.articleText),
      });
      counts.moved += 1;
      continue;
    }

    // 제목만 변경
    if (
      before.articleTitle !== current.articleTitle &&
      textsEqualIgnoringTitle(before, current)
    ) {
      diffs.push({
        articleKey: key,
        articleNumber: current.articleNumber,
        articleTitle: current.articleTitle,
        changeType: "TITLE_CHANGED",
        oldText: before.articleTitle ?? "",
        newText: current.articleTitle ?? "",
        diffOperations: toDiffOps(before.articleText, current.articleText),
      });
      counts.modified += 1;
      continue;
    }

    diffs.push({
      articleKey: key,
      articleNumber: current.articleNumber,
      articleTitle: current.articleTitle,
      changeType: "MODIFIED",
      oldText: before.articleText,
      newText: current.articleText,
      diffOperations: toDiffOps(before.articleText, current.articleText),
    });
    counts.modified += 1;
  }

  // 삭제된 조문
  for (const [key, before] of prevMap) {
    if (nextMap.has(key)) continue;
    diffs.push({
      articleKey: key,
      articleNumber: before.articleNumber,
      articleTitle: before.articleTitle,
      changeType: "DELETED",
      oldText: before.articleText,
      newText: null,
      diffOperations: toDiffOps(before.articleText, ""),
    });
    counts.deleted += 1;
  }

  // 조문 순서 유지 (next의 order 기준)
  diffs.sort((a, b) => {
    const ao = nextMap.get(a.articleKey)?.articleOrder ?? prevMap.get(a.articleKey)?.articleOrder ?? 0;
    const bo = nextMap.get(b.articleKey)?.articleOrder ?? prevMap.get(b.articleKey)?.articleOrder ?? 0;
    return ao - bo;
  });

  return { diffs, counts };
}

// "제N조 삭제 <YYYY. M. D.>" 같은 삭제 표기 감지.
// 조문 본문이 실질적으로 "삭제" 하나만 있는 경우를 판정한다.
// 공식 원문에서 삭제된 조문은 조문 헤더 + "삭제" + 선택적 개정정보/제목만 남는다.
export function isDeletionMarker(text: string): boolean {
  if (!text) return false;
  const stripped = text
    // 조문 번호 (예: "제43조", "제3조의2")
    .replace(/제\s*\d+\s*조(?:의\s*\d+)?/g, "")
    // 개정 이력 <YYYY. M. D., 법률 제N호>
    .replace(/<[^>]*>/g, "")
    // 대괄호 부가 표기 [xxx]
    .replace(/\[[^\]]*\]/g, "")
    // 소괄호 (제목) 또는 (부가). 일부 소스는 삭제 조문에도 옛 제목을 남긴다.
    .replace(/\([^)]*\)/g, "")
    // 공백·구두점·조사 정리
    .replace(/[\s.·,]/g, "");
  return stripped === "삭제";
}

function textsEqualIgnoringTitle(a: NormalizedArticle, b: NormalizedArticle): boolean {
  const stripTitle = (t: string, title: string | null) =>
    title ? t.replace(new RegExp(`\\(${escapeRegex(title)}\\)`), "") : t;
  return stripTitle(a.articleText, a.articleTitle).trim() ===
    stripTitle(b.articleText, b.articleTitle).trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toDiffOps(oldText: string, newText: string): DiffOperation[] {
  const changes = diffLines(oldText, newText, { newlineIsToken: true, ignoreWhitespace: false });
  return changes.map((c) => ({
    type: c.added ? "added" : c.removed ? "removed" : "context",
    text: c.value,
  }));
}
