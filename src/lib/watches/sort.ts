/**
 * 표 헤더에서 고를 수 있는 정렬 축.
 *
 * 헤더가 정렬 가능한 모양인데 실제로는 createdAt 고정이었다("최근 변경" 을
 * 눌러도 15행 순서가 한 글자도 안 바뀜). 헤더를 진짜로 동작하게 만든다.
 *
 * "최근 변경"(lastChangeAt)은 문서의 최신 개정 이벤트에서 끌어오는 파생값이라
 * Prisma orderBy 로는 정렬할 수 없다. 그래서 정렬·페이지네이션은 raw SQL 로
 * id 만 순서대로 뽑고, 본문은 기존 select 로 채운 뒤 그 순서로 되돌린다.
 * 페이지 안에서만 정렬하면 2페이지부터 거짓말이 되기 때문에 DB 에서 정렬한다.
 */
export const WATCH_SORT_KEYS = [
  "title",
  "ministry",
  "applicability",
  "importance",
  "review",
  "change",
  "added",
] as const;
export type WatchSortKey = (typeof WATCH_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export interface WatchSort {
  key: WatchSortKey;
  dir: SortDir;
}

/** 축마다 "처음 누르면 이 방향" 이 다르다. 날짜는 최신순, 이름은 가나다순. */
const DEFAULT_DIR: Record<WatchSortKey, SortDir> = {
  title: "asc",
  ministry: "asc",
  applicability: "asc",
  importance: "desc",
  review: "asc",
  change: "desc",
  added: "desc",
};

/**
 * 아무것도 안 눌렀을 때의 정렬.
 *
 * 등록순(added)이었다. 그런데 표의 오른쪽 끝, 가장 눈에 띄는 자리에 "최근 변경"
 * 열이 있어서 "당연히 최신순이겠지" 로 읽힌다. 실제로는 8.27 → 8.26 → 8.23 →
 * 8.26 처럼 오르내려서 정렬이 깨진 것처럼 보였다. 이 화면에서 먼저 알고 싶은
 * 것도 "내 법령 중 뭐가 최근에 바뀌었나" 이므로 그것을 기본으로 삼는다.
 */
export const DEFAULT_WATCH_SORT: WatchSort = { key: "change", dir: "desc" };

export function parseWatchSort(raw: string | undefined): WatchSort {
  const [k, d] = (raw ?? "").split(":");
  const key = (WATCH_SORT_KEYS as readonly string[]).includes(k)
    ? (k as WatchSortKey)
    : DEFAULT_WATCH_SORT.key;
  const dir: SortDir =
    d === "asc" || d === "desc"
      ? d
      : key === DEFAULT_WATCH_SORT.key && !k
        ? DEFAULT_WATCH_SORT.dir
        : DEFAULT_DIR[key];
  return { key, dir };
}

/** 헤더를 다시 눌렀을 때 갈 상태. 같은 축이면 방향만 뒤집는다. */
export function nextWatchSort(current: WatchSort, key: WatchSortKey): string {
  const dir: SortDir =
    current.key === key
      ? current.dir === "asc"
        ? "desc"
        : "asc"
      : DEFAULT_DIR[key];
  return `${key}:${dir}`;
}
