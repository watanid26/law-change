// 큐 실패 계정 회귀 테스트.
//
// DEAD 49건 중 47건이 WORKER_STALE_TIMEOUT 이었다. 워커가 죽는 건(서버리스
// 300초 제한 등) 문서 잘못이 아닌데 attemptCount 를 태워 5번 만에 DEAD 로
// 만들고 있었다. 오래 걸리는 문서일수록 확실히 죽으니, 큰 문서가 영원히
// 수집되지 않는 구조였다. 진짜 실패와 회수를 따로 세는 규칙을 못박는다.

import { describe, expect, it } from "vitest";
import { readStaleCount, withStaleCount } from "./staleCount";

describe("stale 회수 카운터", () => {
  it("payload 가 비어 있으면 0에서 시작한다", () => {
    expect(readStaleCount(null)).toBe(0);
    expect(readStaleCount(undefined)).toBe(0);
    expect(readStaleCount({})).toBe(0);
  });

  it("기존 payload 를 지우지 않고 카운터만 얹는다", () => {
    const before = { title: "식품위생법", currentMst: "286825" };
    expect(withStaleCount(before, 3)).toEqual({ ...before, staleCount: 3 });
  });

  it("얹은 값을 다시 읽을 수 있다", () => {
    expect(readStaleCount(withStaleCount({ title: "x" }, 7))).toBe(7);
  });

  it("망가진 값은 0으로 떨어진다 — 회수 때문에 잡을 죽이지 않는다", () => {
    for (const bad of [{ staleCount: "3" }, { staleCount: NaN }, { staleCount: null }, "문자열", 42]) {
      expect(readStaleCount(bad)).toBe(0);
    }
  });
});
