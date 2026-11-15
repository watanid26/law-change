// 정렬·페이지네이션 회귀 테스트.
//
// 배경: "최근 개정" 페이지가 "날짜순" 이라고 써놓고 실제로는 날짜순이 아니었다.
// Prisma orderBy 의 desc 가 Postgres 기본값 NULLS FIRST 를 타면서, 공포일이
// 없는 이벤트 10,250건이 목록 맨 앞을 통째로 차지한 것이 원인이었다.
// SQL 자체는 DB 없이 테스트할 수 없지만, 그 주변의 순수 함수 —
// 정렬 축 파싱 / 방향 토글 / 페이지 번호 창 — 는 여기서 고정한다.

import { describe, expect, it, vi } from "vitest";
import { computeDDay, formatKoreanDate, seoulToday } from "@/lib/format";
import { pageWindow } from "@/lib/pagination";
import {
  nextWatchSort,
  parseWatchSort,
  WATCH_SORT_KEYS,
} from "@/lib/watches/sort";
import { parseRecentChangesSort } from "@/lib/queries/recentChangesSort";

describe("최근 개정 정렬 축", () => {
  it("모르는 값은 기본(공포일순)으로 떨어진다", () => {
    expect(parseRecentChangesSort(undefined)).toBe("changed");
    expect(parseRecentChangesSort("")).toBe("changed");
    expect(parseRecentChangesSort("아무거나")).toBe("changed");
  });

  it("시행일순은 그대로 살아남는다", () => {
    expect(parseRecentChangesSort("effective")).toBe("effective");
  });
});

describe("관심 법령 표 헤더 정렬", () => {
  it("정렬 파라미터가 없으면 최근 변경순", () => {
    // 등록순이 기본이었는데, 표 오른쪽 끝의 "최근 변경" 열이 정렬 기준으로
    // 읽혀서 "8.27 → 8.26 → 8.23 → 8.26" 이 깨진 정렬로 보였다.
    expect(parseWatchSort(undefined)).toEqual({ key: "change", dir: "desc" });
    expect(parseWatchSort("")).toEqual({ key: "change", dir: "desc" });
  });

  it("축마다 처음 누를 때의 방향이 다르다 (이름은 가나다, 날짜는 최신)", () => {
    expect(parseWatchSort("title")).toEqual({ key: "title", dir: "asc" });
    expect(parseWatchSort("change")).toEqual({ key: "change", dir: "desc" });
    expect(parseWatchSort("importance")).toEqual({ key: "importance", dir: "desc" });
  });

  it("같은 축을 다시 누르면 방향만 뒤집힌다", () => {
    const first = parseWatchSort(nextWatchSort({ key: "added", dir: "desc" }, "change"));
    expect(first).toEqual({ key: "change", dir: "desc" });
    expect(parseWatchSort(nextWatchSort(first, "change"))).toEqual({
      key: "change",
      dir: "asc",
    });
  });

  it("다른 축으로 옮기면 그 축의 기본 방향으로 시작한다", () => {
    const onChangeAsc = { key: "change", dir: "asc" } as const;
    expect(parseWatchSort(nextWatchSort(onChangeAsc, "title"))).toEqual({
      key: "title",
      dir: "asc",
    });
  });

  it("망가진 값은 기본으로 떨어지고 절대 던지지 않는다", () => {
    for (const raw of ["", ":", "nope:asc", "title:sideways", "::::"]) {
      const parsed = parseWatchSort(raw);
      expect(WATCH_SORT_KEYS).toContain(parsed.key);
      expect(["asc", "desc"]).toContain(parsed.dir);
    }
  });
});

describe("페이지 번호 창", () => {
  it("쪽수가 적으면 전부 보여준다", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("112,290건 / 30건 = 3,743쪽 한가운데서도 양 끝과 주변만 보여준다", () => {
    expect(pageWindow(1500, 3743)).toEqual([
      1, null, 1498, 1499, 1500, 1501, 1502, null, 3743,
    ]);
  });

  it("첫 쪽·마지막 쪽에서 …이 필요 없으면 넣지 않는다", () => {
    expect(pageWindow(1, 6)).toEqual([1, 2, 3, null, 6]);
    expect(pageWindow(3, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("번호는 중복되지 않고 오름차순이다", () => {
    for (const [page, total] of [[1, 1], [2, 3], [50, 100], [99, 100]] as const) {
      const w = pageWindow(page, total).filter((p): p is number => p !== null);
      expect(w).toEqual([...new Set(w)].sort((a, b) => a - b));
      expect(w).toContain(page);
    }
  });
});

describe("한국 날짜 표시", () => {
  it("UTC 자정으로 저장된 공포일·시행일은 그 날짜 그대로 읽힌다", () => {
    expect(formatKoreanDate(new Date("2021-02-19T00:00:00.000Z"))).toBe("2021. 2. 19.");
  });

  it("감지일처럼 실제 시각인 값은 한국 날짜로 읽는다", () => {
    // 한국시간 2026-08-27 09:00 — UTC 로 읽으면 8월 26일이 되어 하루 밀렸다.
    expect(formatKoreanDate(new Date("2026-08-27T00:00:54.842Z"))).toBe("2026. 8. 27.");
    // 한국시간 2026-08-20 02:00
    expect(formatKoreanDate(new Date("2026-08-19T17:00:54.842Z"))).toBe("2026. 8. 20.");
  });

  it("빈값·잘못된 값은 em dash", () => {
    expect(formatKoreanDate(null)).toBe("—");
    expect(formatKoreanDate(new Date("nope"))).toBe("—");
  });

  it("D-day 는 서울 날짜끼리의 차이다", () => {
    const target = new Date("2026-09-01T00:00:00.000Z");
    // 한국시간 8월 28일 오전 2시에 봐도 9월 1일까지는 4일이다.
    vi.setSystemTime(new Date("2026-08-27T17:00:00.000Z"));
    expect(computeDDay(target)).toBe(4);
    // 같은 날 한국시간 오후 11시에 봐도 답은 같아야 한다.
    vi.setSystemTime(new Date("2026-08-28T14:00:00.000Z"));
    expect(computeDDay(target)).toBe(4);
    vi.useRealTimers();
  });
});

describe("서울 기준 오늘", () => {
  it("한국시간 오전에도 오늘이 밀리지 않는다", () => {
    // UTC 서버에서 new Date()+setHours(0,0,0,0) 을 쓰면 한국시간 00~09시에
    // 하루 전을 "오늘" 로 잡는다. 시행 일정의 구간 나누기가 그만큼 어긋났다.
    vi.setSystemTime(new Date("2026-08-29T16:00:00.000Z")); // 서울 8/30 01:00
    expect(seoulToday().toISOString().slice(0, 10)).toBe("2026-08-30");

    vi.setSystemTime(new Date("2026-08-29T23:59:00.000Z")); // 서울 8/30 08:59
    expect(seoulToday().toISOString().slice(0, 10)).toBe("2026-08-30");

    vi.setSystemTime(new Date("2026-08-30T00:01:00.000Z")); // 서울 8/30 09:01
    expect(seoulToday().toISOString().slice(0, 10)).toBe("2026-08-30");
    vi.useRealTimers();
  });

  it("UTC 자정으로 정규화되어 저장된 시행일과 바로 비교된다", () => {
    vi.setSystemTime(new Date("2026-08-29T05:00:00.000Z"));
    const t = seoulToday();
    expect(t.getUTCHours()).toBe(0);
    expect(t.getUTCMinutes()).toBe(0);
    vi.useRealTimers();
  });
});
