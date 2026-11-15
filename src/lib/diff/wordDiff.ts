// 라운드 18 T1: 단어 단위 diff. 심사평 "제6조의4제3항 → 제6조의4제5항 같은 단일 숫자
// 변경조차 아무런 하이라이트 없이 렌더링" 대응. jsdiff 의 diffWordsWithSpace 를
// 얇게 래핑해 컴포넌트에서 스타일 적용만 하도록.

import { diffWordsWithSpace, type Change } from "diff";

export type WordDiffOp = { type: "eq" | "add" | "del"; text: string };

export function computeWordDiff(before: string, after: string): WordDiffOp[] {
  return diffWordsWithSpace(before, after).map((c: Change): WordDiffOp => ({
    type: c.added ? "add" : c.removed ? "del" : "eq",
    text: c.value,
  }));
}

/** 종전(before) 패널용 — add 조각은 제외. eq + del 만 남김. */
export function diffForBeforePanel(before: string, after: string): WordDiffOp[] {
  return computeWordDiff(before, after).filter((o) => o.type !== "add");
}

/** 현재(after) 패널용 — del 조각은 제외. eq + add 만 남김. */
export function diffForAfterPanel(before: string, after: string): WordDiffOp[] {
  return computeWordDiff(before, after).filter((o) => o.type !== "del");
}

/**
 * 개행(\n)을 기준으로 op 목록을 라인 단위 2차원 배열로 재조립.
 * 원본 텍스트가 배열이라면 join("\n") 후 이 함수를 통해 다시 라인별로 렌더할 수 있음.
 * 라인 안의 각 op 는 <span> 하나로 스타일링해 단어 단위 하이라이트 표현.
 */
export function opsByLines(ops: WordDiffOp[]): WordDiffOp[][] {
  const lines: WordDiffOp[][] = [[]];
  for (const op of ops) {
    const parts = op.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part.length > 0) {
        lines[lines.length - 1].push({ type: op.type, text: part });
      }
    });
  }
  return lines;
}
