/**
 * 정렬 축. 화면 설명 문구와 반드시 같은 뜻이어야 한다.
 * - changed  : 공포일(없으면 감지일) 최신순 — 기본. "무엇이 새로 바뀌었나"
 * - effective: 시행일 임박순 — "언제부터 지켜야 하나"
 */
export type RecentChangesSort = "changed" | "effective";

export function parseRecentChangesSort(v: string | undefined): RecentChangesSort {
  return v === "effective" ? "effective" : "changed";
}
