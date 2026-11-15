// 워커 회수(stale) 횟수를 잡 payload 에 얹고 읽는 순수 헬퍼.
//
// 진짜 실패(attemptCount, 5회)와 회수(staleCount, 20회)를 따로 세기 위한 것.
// prisma 를 끌어오지 않아야 테스트에서 바로 부를 수 있어 파일을 나눴다.

export function readStaleCount(payload: unknown): number {
  const n = (payload as { staleCount?: unknown } | null)?.staleCount;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function withStaleCount(payload: unknown, n: number): Record<string, unknown> {
  const base = payload && typeof payload === "object" ? (payload as object) : {};
  return { ...base, staleCount: n };
}
