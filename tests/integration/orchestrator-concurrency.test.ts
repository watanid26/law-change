// Integration test: Orchestrator 동시성 · 통계 분리 · LOCK_LOST
// - Bootstrap 동시 실행: 정확히 1개만 스캔, 다른 하나는 LOCKED
// - Bootstrap 첫 페이지 실패 → status=failed
// - Reconciliation 동시 실행: create race → 하나만 성공, 다른 하나는 기존 세션 사용
// - Reconciliation 스테일 lock 뺏기
// - LOCK_LOST: 다른 워커가 lock 뺏은 후 원 워커의 commit 실패 → 즉시 중단
// - CollectorRun.scannedCount 는 "이번 호출"만 (세션 누적과 분리)

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// ────────────────────────────────────────────────────────────────
// API 모듈을 mock — 실제 법제처 호출 없이 orchestrator 로직만 검증
// vi.mock 은 hoisted 되므로 아래 vi.hoisted() 로 mock 함수를 미리 만든다.
// ────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  searchLaws: vi.fn(),
  searchAdminRules: vi.fn(),
}));

vi.mock("@/lib/law-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/law-api/client")>();
  return { ...actual, searchLaws: mocks.searchLaws };
});
vi.mock("@/lib/admin-rule-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-rule-api/client")>();
  return { ...actual, searchAdminRules: mocks.searchAdminRules };
});

import { runFullCatalogBootstrap, runMonthlyReconciliation } from "@/lib/collector/orchestrator";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_ORCH_";

function fakeLawItem(id: string) {
  return {
    법령일련번호: `MST-${id}`,
    법령ID: id,
    법령명한글: `테스트법령 ${id}`,
    법령구분명: "법률",
    소관부처명: "테스트부",
    소관부처코드: "9999",
    공포번호: "1",
    공포일자: "20260101",
    시행일자: "20260201",
    제개정구분명: "제정",
    현행연혁코드: "현행",
    법령상세링크: `/test/${id}`,
    id,
  };
}

async function cleanupAll() {
  await prisma.collectorJob.deleteMany({
    where: { sourceId: { startsWith: TEST_PREFIX } },
  });
  await prisma.reconciliationSourceSnapshot.deleteMany({
    where: { sourceId: { startsWith: TEST_PREFIX } },
  });
  await prisma.reconciliationProgress.deleteMany({
    where: { sessionId: { startsWith: "sess-" }, sourceType: "LAW" }, // 테스트 세션만
  });
  await prisma.bootstrapProgress.deleteMany({
    where: { scope: { startsWith: TEST_PREFIX } },
  });
  await prisma.collectorRun.deleteMany({
    where: { jobType: "BOOTSTRAP", metadata: { path: ["scope"], string_starts_with: TEST_PREFIX } },
  });
}

beforeAll(async () => await cleanupAll());
beforeEach(() => {
  mocks.searchLaws.mockReset();
  mocks.searchAdminRules.mockReset();
});
afterEach(async () => {
  // 각 테스트 끝나면 진행 중이던 세션·잡 정리
  await prisma.collectorJob.deleteMany({
    where: { sourceId: { startsWith: TEST_PREFIX } },
  });
});
afterAll(async () => {
  await cleanupAll();
  await prisma.$disconnect();
});

// ────────────────────────────────────────────────────────────────
// BOOTSTRAP
// ────────────────────────────────────────────────────────────────
describe("Bootstrap orchestrator 동시성", () => {
  it("두 워커 동시 실행: 정확히 1명만 스캔, 다른 하나는 LOCKED", async () => {
    const scope = `${TEST_PREFIX}concurrent_${Date.now()}`;
    // 1페이지 3개 리턴, 다음 페이지는 빈 결과 (종료)
    let call = 0;
    mocks.searchLaws.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return {
          totalCount: 3,
          items: [
            fakeLawItem(`${TEST_PREFIX}c1`),
            fakeLawItem(`${TEST_PREFIX}c2`),
            fakeLawItem(`${TEST_PREFIX}c3`),
          ],
        };
      }
      return { totalCount: 3, items: [] };
    });

    const [a, b] = await Promise.all([
      runFullCatalogBootstrap({ sourceType: "LAW", scope, maxPagesPerRun: 5 }),
      runFullCatalogBootstrap({ sourceType: "LAW", scope, maxPagesPerRun: 5 }),
    ]);

    const results = [a, b];
    const winners = results.filter((r) => r.status === "COMPLETED");
    const losers = results.filter((r) => r.status === "LOCKED");
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
    expect(losers[0].reason).toBe("CONCURRENT_LOCK");

    // 승자만 실제 스캔 (rawScanned > 0), 패자는 0
    expect(winners[0].rawScanned).toBe(3);
    expect(losers[0].rawScanned).toBe(0);

    // CollectorRun 도 반영
    const winRun = await prisma.collectorRun.findUnique({ where: { id: winners[0].runId } });
    const loseRun = await prisma.collectorRun.findUnique({ where: { id: losers[0].runId } });
    expect(winRun?.scannedCount).toBe(3);
    expect(loseRun?.scannedCount ?? 0).toBe(0);
  });

  it("첫 페이지 API 실패 → CollectorRun status=failed (rawScanned=0)", async () => {
    const scope = `${TEST_PREFIX}firstfail_${Date.now()}`;
    mocks.searchLaws.mockRejectedValue(new Error("API 500 boom"));

    const res = await runFullCatalogBootstrap({ sourceType: "LAW", scope, maxPagesPerRun: 3 });

    expect(res.rawScanned).toBe(0);
    expect(res.status).toBe("FAILED");
    const run = await prisma.collectorRun.findUnique({ where: { id: res.runId } });
    expect(run?.status).toBe("failed");
    expect(run?.scannedCount).toBe(0);
    expect(run?.errorMessage).toMatch(/API 500/);
  });

  it("1페이지 성공 후 2페이지 실패 → status=partial_success (rawScanned>0)", async () => {
    const scope = `${TEST_PREFIX}partial_${Date.now()}`;
    let call = 0;
    mocks.searchLaws.mockImplementation(async () => {
      call += 1;
      if (call === 1) return { totalCount: 200, items: [fakeLawItem(`${TEST_PREFIX}p1`)] };
      throw new Error("network reset");
    });

    const res = await runFullCatalogBootstrap({ sourceType: "LAW", scope, maxPagesPerRun: 3 });

    expect(res.rawScanned).toBeGreaterThan(0);
    const run = await prisma.collectorRun.findUnique({ where: { id: res.runId } });
    expect(run?.status).toBe("partial_success");
  });

  it("LOCK_LOST: 다른 워커가 스테일 판정으로 lock 뺏은 후 원 워커 commit 실패", async () => {
    const scope = `${TEST_PREFIX}locklost_${Date.now()}`;

    // 첫 페이지 fetch 도중에 lockedBy 를 강제로 변경 (스테일 takeover 시뮬레이션)
    mocks.searchLaws.mockImplementationOnce(async () => {
      // 이 시점에 lockedBy 를 다른 값으로 바꾸면 commit 시 WHERE lockedBy=me 미매치
      await prisma.bootstrapProgress.updateMany({
        where: { sourceType: "LAW", scope },
        data: { lockedBy: "other-worker", heartbeatAt: new Date() },
      });
      return {
        totalCount: 1,
        items: [fakeLawItem(`${TEST_PREFIX}ll1`)],
      };
    });

    const res = await runFullCatalogBootstrap({ sourceType: "LAW", scope, maxPagesPerRun: 3 });

    // LOCK_LOST 는 status=LOCKED, reason=LOCK_LOST 로 반환
    expect(res.status).toBe("LOCKED");
    expect(res.reason).toBe("LOCK_LOST");
    // 진행상태는 다른 워커 소유로 유지 — 우리는 override 하지 않았음
    const after = await prisma.bootstrapProgress.findFirst({ where: { sourceType: "LAW", scope } });
    expect(after?.lockedBy).toBe("other-worker");
    // CollectorRun 은 partial_success (첫 페이지는 훑음) — 또는 failed (rawScanned=0)
    // rawScanned=1 이므로 partial_success 예상
    const run = await prisma.collectorRun.findUnique({ where: { id: res.runId } });
    expect(run?.status).toBe("partial_success");
    expect(run?.errorMessage).toMatch(/BOOTSTRAP_LOCK_LOST/);
    // metadata.lockLost = true
    const meta = run?.metadata as { lockLost?: boolean };
    expect(meta?.lockLost).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────
// RECONCILIATION
// ────────────────────────────────────────────────────────────────
describe("Reconciliation orchestrator 동시성 · 세션 통계", () => {
  async function cleanReconLaw() {
    // 이 파일 테스트 격리를 위해 LAW 세션 전체 삭제 (테스트 시작 시)
    // 스냅샷은 cascade 되지 않을 수 있으니 명시 삭제
    const sessions = await prisma.reconciliationProgress.findMany({
      where: { sourceType: "LAW" },
      select: { id: true },
    });
    for (const s of sessions) {
      await prisma.reconciliationSourceSnapshot.deleteMany({ where: { reconciliationId: s.id } });
    }
    await prisma.reconciliationProgress.deleteMany({ where: { sourceType: "LAW" } });
  }

  beforeEach(async () => await cleanReconLaw());

  it("create race: 두 워커 동시 시작 시 partial unique 로 세션 1개만 생성", async () => {
    let call = 0;
    mocks.searchLaws.mockImplementation(async () => {
      call += 1;
      if (call === 1) return { totalCount: 2, items: [{ 법령ID: `${TEST_PREFIX}r1` } as never] };
      return { totalCount: 2, items: [{ 법령ID: `${TEST_PREFIX}r2` } as never] };
    });

    const [a, b] = await Promise.all([
      runMonthlyReconciliation({ sourceType: "LAW", maxPagesPerRun: 1 }),
      runMonthlyReconciliation({ sourceType: "LAW", maxPagesPerRun: 1 }),
    ]);

    // RUNNING 세션은 정확히 1개 (partial unique index 보장)
    const activeSessions = await prisma.reconciliationProgress.count({
      where: { sourceType: "LAW", status: { in: ["RUNNING", "COMPLETED"] } },
    });
    expect(activeSessions).toBe(1);

    // 두 응답은 같은 sessionId 참조 or 하나는 CONCURRENT_LOCK 로 스킵
    const sessionIds = new Set([a.sessionId, b.sessionId]);
    expect(sessionIds.size).toBe(1);
  });

  it("실행별 통계 분리: CollectorRun.scannedCount=이번 호출만, ReconciliationProgress.scannedCount=세션 누적", async () => {
    // totalCount 를 페이지 크기보다 훨씬 크게 잡아 currentPage > ceil(total/PAGE_SIZE) 종료를 회피.
    // 실제 종료는 페이지 결과 = 0 (마지막 mock) 로 유도.
    const TOTAL = 500;

    // 첫 실행: 페이지 1 → 3개
    mocks.searchLaws.mockResolvedValueOnce({
      totalCount: TOTAL,
      items: [
        { 법령ID: `${TEST_PREFIX}s1` },
        { 법령ID: `${TEST_PREFIX}s2` },
        { 법령ID: `${TEST_PREFIX}s3` },
      ] as never,
    });
    const first = await runMonthlyReconciliation({ sourceType: "LAW", maxPagesPerRun: 1 });
    expect(first.scannedCount).toBe(3); // 세션 누적
    const firstRun = await prisma.collectorRun.findUnique({ where: { id: first.runId } });
    expect(firstRun?.scannedCount).toBe(3); // 첫 실행이므로 세션 누적 == 이번 실행

    // 두 번째 실행 이어서: 페이지 2 → 3개 (누적 6)
    mocks.searchLaws.mockResolvedValueOnce({
      totalCount: TOTAL,
      items: [
        { 법령ID: `${TEST_PREFIX}s4` },
        { 법령ID: `${TEST_PREFIX}s5` },
        { 법령ID: `${TEST_PREFIX}s6` },
      ] as never,
    });
    // 페이지 3 은 빈 결과 → 완료
    mocks.searchLaws.mockResolvedValueOnce({ totalCount: TOTAL, items: [] as never });
    const second = await runMonthlyReconciliation({ sourceType: "LAW", maxPagesPerRun: 5 });
    expect(second.scannedCount).toBe(6); // 세션 누적 = 3 + 3
    const secondRun = await prisma.collectorRun.findUnique({ where: { id: second.runId } });
    // 이번 실행에서만 처리한 원본 = 3 (페이지 2) + 0 (페이지 3 빈 결과) = 3
    expect(secondRun?.scannedCount).toBe(3);
    // metadata 에서 분리 검증
    const meta = secondRun?.metadata as { runScanned?: number; sessionScanned?: number };
    expect(meta?.runScanned).toBe(3);
    expect(meta?.sessionScanned).toBe(6);
  });

  it("LOCK_LOST: 세션 lock 을 다른 워커가 뺏은 후 commit 실패", async () => {
    // 첫 페이지 fetch 도중에 세션 lockedBy 를 강제 변경
    mocks.searchLaws.mockImplementationOnce(async () => {
      await prisma.reconciliationProgress.updateMany({
        where: { sourceType: "LAW", status: "RUNNING" },
        data: { lockedBy: "other-recon-worker", heartbeatAt: new Date() },
      });
      return {
        totalCount: 1,
        items: [{ 법령ID: `${TEST_PREFIX}ll` } as never],
      };
    });

    const res = await runMonthlyReconciliation({ sourceType: "LAW", maxPagesPerRun: 3 });

    // reason=LOCK_LOST 로 표시
    expect(res.reason).toBe("LOCK_LOST");
    const run = await prisma.collectorRun.findUnique({ where: { id: res.runId } });
    // runScanned=1 (첫 페이지 훑음) → partial_success
    expect(run?.status).toBe("partial_success");
    expect(run?.errorMessage).toMatch(/RECON_LOCK_LOST/);
    const meta = run?.metadata as { lockLost?: boolean };
    expect(meta?.lockLost).toBe(true);
  });

  it("스테일 세션 lock 은 새 워커가 이어받음 (heartbeat > STALE_MS)", async () => {
    // 오래된 세션 수동 생성
    const oldSession = await prisma.reconciliationProgress.create({
      data: {
        sourceType: "LAW",
        sessionId: `sess-stale-${Date.now()}`,
        cursorPage: 5,
        status: "RUNNING",
        scannedCount: 400,
        totalCount: 800,
        lockedBy: "dead-recon-worker",
        lockedAt: new Date(Date.now() - 10 * 60_000),
        heartbeatAt: new Date(Date.now() - 10 * 60_000), // 10분 전 (stale)
      },
    });

    mocks.searchLaws.mockResolvedValueOnce({
      totalCount: 800,
      items: [{ 법령ID: `${TEST_PREFIX}sk` } as never],
    });
    mocks.searchLaws.mockResolvedValueOnce({ totalCount: 800, items: [] as never }); // 종료

    const res = await runMonthlyReconciliation({ sourceType: "LAW", maxPagesPerRun: 2 });

    // 스테일 세션을 이어받아 진행
    expect(res.sessionId).toBe(oldSession.sessionId);
    expect(res.scannedCount).toBeGreaterThan(400); // 이전 400 + 이번 실행

    // 새 워커가 lock 획득
    const after = await prisma.reconciliationProgress.findUnique({ where: { id: oldSession.id } });
    expect(after?.lockedBy).not.toBe("dead-recon-worker");
  });
});
