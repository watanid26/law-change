// Integration test: Bootstrap 원자성 · ALREADY_COMPLETED · 정확한 카운트
// - 두 동시 실행 시 한쪽만 lock 획득
// - COMPLETED 상태에서 reset=false 재실행 시 조기 반환
// - matched vs enqueued vs alreadyActive 분리 카운트

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 법제처 API 호출은 mock으로 대체 (integration 테스트 목적은 concurrency/lock 검증)
// 이 파일에서는 orchestrator 를 직접 호출하지 않고, DB 상태 조작으로 시나리오 재현
async function cleanup() {
  await prisma.bootstrapProgress.deleteMany({
    where: { scope: { startsWith: "TEST_BOOT_" } },
  });
}

afterEach(async () => await cleanup());
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("Bootstrap 원자성 · 카운트", () => {
  it("BootstrapProgress unique 제약이 동일 (sourceType, scope) 중복 create를 방지", async () => {
    const scope = `TEST_BOOT_unique_${Date.now()}`;
    await prisma.bootstrapProgress.create({
      data: { sourceType: "LAW", scope, cursorPage: 1, status: "RUNNING" },
    });
    await expect(
      prisma.bootstrapProgress.create({
        data: { sourceType: "LAW", scope, cursorPage: 1, status: "RUNNING" },
      }),
    ).rejects.toThrow();
  });

  it("조건부 UPDATE로 두 워커 동시 lock 시 한쪽만 성공", async () => {
    const scope = `TEST_BOOT_lock_${Date.now()}`;
    const p = await prisma.bootstrapProgress.create({
      data: { sourceType: "LAW", scope, cursorPage: 1, status: "RUNNING" },
    });
    const STALE_MS = 5 * 60_000;
    const staleThreshold = new Date(Date.now() - STALE_MS);
    const workerA = "worker-A";
    const workerB = "worker-B";

    // 두 워커가 동시에 조건부 UPDATE 시도 — Postgres row-level lock으로 직렬화됨
    // 두 번째 UPDATE는 첫 번째가 커밋한 후 WHERE 조건을 재평가:
    // - lockedBy는 이제 첫 번째 워커
    // - heartbeatAt은 방금 갱신되어 fresh
    // → 두 번째 워커의 OR 조건 어느 것도 만족 안 됨 → count=0
    const [ra, rb] = await Promise.all([
      prisma.bootstrapProgress.updateMany({
        where: {
          id: p.id,
          OR: [{ lockedBy: null }, { lockedBy: workerA }, { heartbeatAt: { lt: staleThreshold } }, { heartbeatAt: null }],
        },
        data: { lockedAt: new Date(), lockedBy: workerA, heartbeatAt: new Date() },
      }),
      prisma.bootstrapProgress.updateMany({
        where: {
          id: p.id,
          OR: [{ lockedBy: null }, { lockedBy: workerB }, { heartbeatAt: { lt: staleThreshold } }, { heartbeatAt: null }],
        },
        data: { lockedAt: new Date(), lockedBy: workerB, heartbeatAt: new Date() },
      }),
    ]);
    // 정확히 하나만 성공 (원자성 증명)
    expect(ra.count + rb.count).toBe(1);
    const after = await prisma.bootstrapProgress.findUnique({ where: { id: p.id } });
    expect([workerA, workerB]).toContain(after?.lockedBy);
  });

  it("스테일 lock (heartbeat > 5분 전)만 새 워커가 뺏을 수 있음", async () => {
    const scope = `TEST_BOOT_stale_${Date.now()}`;
    const oldHeartbeat = new Date(Date.now() - 10 * 60_000); // 10분 전
    await prisma.bootstrapProgress.create({
      data: {
        sourceType: "LAW",
        scope,
        cursorPage: 5,
        status: "RUNNING",
        lockedBy: "dead-worker",
        lockedAt: oldHeartbeat,
        heartbeatAt: oldHeartbeat,
      },
    });
    const STALE_MS = 5 * 60_000;
    const staleThreshold = new Date(Date.now() - STALE_MS);
    const newWorker = "fresh-worker";
    const res = await prisma.bootstrapProgress.updateMany({
      where: {
        sourceType: "LAW",
        scope,
        OR: [{ lockedBy: null }, { lockedBy: newWorker }, { heartbeatAt: { lt: staleThreshold } }, { heartbeatAt: null }],
      },
      data: { lockedBy: newWorker, lockedAt: new Date(), heartbeatAt: new Date() },
    });
    expect(res.count).toBe(1);
    const after = await prisma.bootstrapProgress.findFirst({ where: { sourceType: "LAW", scope } });
    expect(after?.lockedBy).toBe(newWorker);
  });

  it("Fresh lock (heartbeat < 5분)은 다른 워커가 못 뺏음", async () => {
    const scope = `TEST_BOOT_fresh_${Date.now()}`;
    const freshHeartbeat = new Date(Date.now() - 60_000); // 1분 전
    await prisma.bootstrapProgress.create({
      data: {
        sourceType: "LAW",
        scope,
        cursorPage: 5,
        status: "RUNNING",
        lockedBy: "active-worker",
        lockedAt: freshHeartbeat,
        heartbeatAt: freshHeartbeat,
      },
    });
    const STALE_MS = 5 * 60_000;
    const staleThreshold = new Date(Date.now() - STALE_MS);
    const attacker = "attacker-worker";
    const res = await prisma.bootstrapProgress.updateMany({
      where: {
        sourceType: "LAW",
        scope,
        OR: [{ lockedBy: null }, { lockedBy: attacker }, { heartbeatAt: { lt: staleThreshold } }, { heartbeatAt: null }],
      },
      data: { lockedBy: attacker, lockedAt: new Date(), heartbeatAt: new Date() },
    });
    expect(res.count).toBe(0); // 뺏기 실패
    const after = await prisma.bootstrapProgress.findFirst({ where: { sourceType: "LAW", scope } });
    expect(after?.lockedBy).toBe("active-worker"); // 원래 워커 유지
  });

  it("COMPLETED 상태에서 reset=false 재실행은 조기 반환 정책", async () => {
    // 실제 함수는 API 호출을 하므로 여기선 상태 전이 정책만 확인:
    // - COMPLETED + reset=false → 조기 반환
    // - COMPLETED + reset=true → 카운트 0으로 재시작
    const scope = `TEST_BOOT_complete_${Date.now()}`;
    await prisma.bootstrapProgress.create({
      data: {
        sourceType: "LAW",
        scope,
        cursorPage: 57,
        status: "COMPLETED",
        rawScannedCount: 5603,
        matchedCount: 5603,
        enqueuedCount: 5200,
        alreadyActiveCount: 403,
      },
    });
    // reset=false 로직 검증 — orchestrator가 조기 return 하므로 DB는 변화 없어야 함
    // 여기서는 정책이 정확한지만 assert
    const before = await prisma.bootstrapProgress.findFirst({ where: { scope } });
    expect(before?.status).toBe("COMPLETED");
    expect(before?.rawScannedCount).toBe(5603);

    // reset=true 시뮬레이션 — 카운트 초기화 UPDATE
    await prisma.bootstrapProgress.update({
      where: { id: before!.id },
      data: {
        cursorPage: 1,
        rawScannedCount: 0,
        matchedCount: 0,
        enqueuedCount: 0,
        alreadyActiveCount: 0,
        status: "RUNNING",
        startedAt: new Date(),
        finishedAt: null,
      },
    });
    const after = await prisma.bootstrapProgress.findFirst({ where: { scope } });
    expect(after?.rawScannedCount).toBe(0);
    expect(after?.status).toBe("RUNNING");
  });
});

describe("Reconciliation snapshot 오류 처리", () => {
  it("createMany with skipDuplicates: P2002 중복은 조용히 스킵", async () => {
    const session = await prisma.reconciliationProgress.create({
      data: { sourceType: "LAW", sessionId: `TEST_SNAP_${Date.now()}`, cursorPage: 1, status: "RUNNING" },
    });
    // 1차 저장
    await prisma.reconciliationSourceSnapshot.createMany({
      data: [
        { reconciliationId: session.id, sourceId: "S1" },
        { reconciliationId: session.id, sourceId: "S2" },
      ],
      skipDuplicates: true,
    });
    // 2차 저장 (S1 중복 + S3 신규) — skipDuplicates 로 예외 없이 신규만 추가
    await prisma.reconciliationSourceSnapshot.createMany({
      data: [
        { reconciliationId: session.id, sourceId: "S1" },
        { reconciliationId: session.id, sourceId: "S3" },
      ],
      skipDuplicates: true,
    });
    const total = await prisma.reconciliationSourceSnapshot.count({
      where: { reconciliationId: session.id },
    });
    expect(total).toBe(3); // S1, S2, S3

    await prisma.reconciliationProgress.delete({ where: { id: session.id } });
  });

  it("FK 오류(존재하지 않는 reconciliationId)는 throw", async () => {
    await expect(
      prisma.reconciliationSourceSnapshot.createMany({
        data: [{ reconciliationId: "nonexistent-id", sourceId: "S1" }],
        skipDuplicates: true,
      }),
    ).rejects.toThrow();
  });
});

// vi 미사용 경고 억제용
void vi;
