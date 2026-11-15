// Integration test: CollectorJob 큐 안전성
// - 활성 잡 partial unique
// - 두 워커 동시 claim 시 겹침 없음
// - stale 복구 시 attempt 증가 · maxAttempts 초과 시 DEAD

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  claimPendingJobs,
  enqueueJob,
  makeWorkerId,
  markJobFailed,
  recoverStaleJobs,
} from "@/lib/collector/queue";

const prisma = new PrismaClient();

const TEST_PREFIX = "TEST_INT_";

async function cleanup() {
  await prisma.collectorJob.deleteMany({
    where: { sourceId: { startsWith: TEST_PREFIX } },
  });
}

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("CollectorJob 큐 안전성", () => {
  it("동일 (sourceType, sourceId, jobType) 활성 잡은 unique index로 중복 방지", async () => {
    const id = `${TEST_PREFIX}dup_${Date.now()}`;
    const first = await enqueueJob({ jobType: "DETAIL", sourceType: "LAW", sourceId: id });
    const second = await enqueueJob({ jobType: "DETAIL", sourceType: "LAW", sourceId: id });
    expect(first).toBe("enqueued");
    expect(second).toBe("already_active");

    const count = await prisma.collectorJob.count({
      where: { sourceId: id, status: { in: ["PENDING", "RUNNING", "RETRY"] } },
    });
    expect(count).toBe(1);
  });

  it("두 워커가 동시에 claim하면 겹침 0", async () => {
    // 10개 잡 준비
    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const sid = `${TEST_PREFIX}concurrent_${Date.now()}_${i}`;
      await enqueueJob({ jobType: "DETAIL", sourceType: "LAW", sourceId: sid });
      ids.push(sid);
    }

    const workerA = makeWorkerId("A");
    const workerB = makeWorkerId("B");
    const [a, b] = await Promise.all([
      claimPendingJobs(workerA, 5),
      claimPendingJobs(workerB, 5),
    ]);
    const aIds = new Set(a.map((j) => j.id));
    const bIds = new Set(b.map((j) => j.id));
    const overlap = [...aIds].filter((id) => bIds.has(id));
    expect(overlap.length).toBe(0);
    expect(aIds.size + bIds.size).toBeLessThanOrEqual(10);
  });

  it("stale 복구는 attempt 증가 + MAX_ATTEMPTS 초과 시 DEAD", async () => {
    const id = `${TEST_PREFIX}stale_${Date.now()}`;
    await enqueueJob({ jobType: "DETAIL", sourceType: "LAW", sourceId: id });
    // 강제로 RUNNING 상태로 옛날 lockedAt 설정
    await prisma.collectorJob.updateMany({
      where: { sourceId: id },
      data: {
        status: "RUNNING",
        lockedAt: new Date(Date.now() - 30 * 60_000), // 30분 전
        lockedBy: "dead-worker",
        attemptCount: 3, // MAX_ATTEMPTS(5) 미만
      },
    });
    const r1 = await recoverStaleJobs(15);
    expect(r1.recovered).toBeGreaterThan(0);
    const after1 = await prisma.collectorJob.findFirst({ where: { sourceId: id } });
    expect(after1?.status).toBe("RETRY");
    expect(after1?.attemptCount).toBe(4);
    expect(after1?.lockedBy).toBeNull();

    // 다시 RUNNING + 오래된 lock + attempt 4로 (다음 복구에서 5가 되어 DEAD)
    await prisma.collectorJob.updateMany({
      where: { sourceId: id },
      data: {
        status: "RUNNING",
        lockedAt: new Date(Date.now() - 30 * 60_000),
        lockedBy: "dead-worker-2",
        attemptCount: 4,
      },
    });
    const r2 = await recoverStaleJobs(15);
    expect(r2.deadened).toBeGreaterThan(0);
    const after2 = await prisma.collectorJob.findFirst({ where: { sourceId: id } });
    expect(after2?.status).toBe("DEAD");
    expect(after2?.attemptCount).toBe(5);
  });

  it("markJobFailed는 재시도 스케줄과 DEAD 전이를 정확히 결정", async () => {
    const id = `${TEST_PREFIX}fail_${Date.now()}`;
    await enqueueJob({ jobType: "DETAIL", sourceType: "LAW", sourceId: id });
    const job = await prisma.collectorJob.findFirst({ where: { sourceId: id } });
    const outcome1 = await markJobFailed(job!.id, "network error", 0);
    expect(outcome1).toBe("RETRY");
    const after1 = await prisma.collectorJob.findUnique({ where: { id: job!.id } });
    expect(after1?.status).toBe("RETRY");
    expect(after1?.attemptCount).toBe(1);
    expect(after1!.nextRunAt.getTime()).toBeGreaterThan(Date.now());

    // 4번째 실패 (attemptCount 4 → 5 == MAX) → DEAD
    const outcome2 = await markJobFailed(job!.id, "still failing", 4);
    expect(outcome2).toBe("DEAD");
  });

  it("DONE 잡은 다음 sync에서 다시 enqueue 가능", async () => {
    const id = `${TEST_PREFIX}reissue_${Date.now()}`;
    await enqueueJob({ jobType: "DETAIL", sourceType: "LAW", sourceId: id });
    // DONE 처리
    await prisma.collectorJob.updateMany({
      where: { sourceId: id },
      data: { status: "DONE", finishedAt: new Date() },
    });
    // 다시 enqueue → 활성 잡이 없으므로 성공
    const second = await enqueueJob({ jobType: "DETAIL", sourceType: "LAW", sourceId: id });
    expect(second).toBe("enqueued");

    const activeCount = await prisma.collectorJob.count({
      where: { sourceId: id, status: { in: ["PENDING", "RUNNING", "RETRY"] } },
    });
    expect(activeCount).toBe(1);
  });
});
