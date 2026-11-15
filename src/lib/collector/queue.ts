// CollectorJob 큐 관리 — 원자적 claim + 상태 전이 + stale 복구
// PostgreSQL FOR UPDATE SKIP LOCKED 로 다중 워커 안전.
// 활성 잡 중복은 partial unique index (schema v4) 로 DB 레벨에서도 방지.

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readStaleCount, withStaleCount } from "./staleCount";

// stale threshold — env로 튜닝 (default 5분)
export const PROGRESS_LOCK_STALE_MS = Number(process.env.COLLECTOR_PROGRESS_LOCK_STALE_MS ?? "300000");

// Worker가 lock을 잃은 상태로 계속 진행하는 것 방지용 에러
// orchestrator에서 progress commit updateMany count=0 시 throw.
// runJobBatch 등 상위 로직이 이 에러를 잡아 즉시 중단.
export class CollectorLockLostError extends Error {
  code: string;
  constructor(context: string) {
    super(`Lock lost: ${context}`);
    this.name = "CollectorLockLostError";
    this.code = "COLLECTOR_LOCK_LOST";
  }
}

export function makeWorkerId(source?: string): string {
  const short = randomUUID().slice(0, 8);
  return `${source ?? "worker"}-${process.pid ?? 0}-${short}`;
}

export interface ClaimedJob {
  id: string;
  jobType: string;
  sourceType: string;
  sourceId: string;
  attemptCount: number;
  payload: unknown;
  lockedAt: Date;
  lockedBy: string;
}

// 원자적으로 pending·retry 잡을 최대 limit개 claim.
// FOR UPDATE SKIP LOCKED + 같은 tx 안에서 status='RUNNING' 업데이트.
export async function claimPendingJobs(workerId: string, limit: number): Promise<ClaimedJob[]> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
        FROM "collector_job"
       WHERE "status" IN ('PENDING', 'RETRY')
         AND "next_run_at" <= ${now}
       ORDER BY "next_run_at" ASC, "created_at" ASC
       LIMIT ${limit}
       FOR UPDATE SKIP LOCKED
    `;
    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);
    await tx.collectorJob.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "RUNNING",
        lockedAt: now,
        lockedBy: workerId,
        startedAt: now,
      },
    });

    const rows = await tx.collectorJob.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        jobType: true,
        sourceType: true,
        sourceId: true,
        attemptCount: true,
        payload: true,
        lockedAt: true,
        lockedBy: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      jobType: r.jobType,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      attemptCount: r.attemptCount,
      payload: r.payload,
      lockedAt: r.lockedAt!,
      lockedBy: r.lockedBy!,
    }));
  });
}

export async function markJobDone(jobId: string): Promise<void> {
  await prisma.collectorJob.update({
    where: { id: jobId },
    data: {
      status: "DONE",
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

const MAX_ATTEMPTS = Number(process.env.COLLECTOR_MAX_ATTEMPTS ?? "5");
/** 워커가 죽어서 회수되는 횟수의 한도. 진짜 실패(MAX_ATTEMPTS)와 따로 센다. */
const MAX_STALE_RECOVERIES = Number(process.env.COLLECTOR_MAX_STALE ?? "20");
const BACKOFF_MINUTES = [5, 30, 120, 360, 720]; // 5m, 30m, 2h, 6h, 12h

// 재시도 스케줄 or DEAD (실패 처리)
export async function markJobFailed(
  jobId: string,
  error: string,
  attemptCount: number,
): Promise<"RETRY" | "DEAD"> {
  const nextAttempt = attemptCount + 1;
  if (nextAttempt >= MAX_ATTEMPTS) {
    await prisma.collectorJob.update({
      where: { id: jobId },
      data: {
        status: "DEAD",
        finishedAt: new Date(),
        attemptCount: nextAttempt,
        lastError: error,
        lockedAt: null,
        lockedBy: null,
      },
    });
    return "DEAD";
  }
  const backoffMin = BACKOFF_MINUTES[Math.min(attemptCount, BACKOFF_MINUTES.length - 1)];
  const nextRunAt = new Date(Date.now() + backoffMin * 60_000);
  await prisma.collectorJob.update({
    where: { id: jobId },
    data: {
      status: "RETRY",
      attemptCount: nextAttempt,
      nextRunAt,
      lastError: error,
      lockedAt: null,
      lockedBy: null,
    },
  });
  return "RETRY";
}

// stale 복구: RUNNING인 채로 stallMinutes 이상 지난 잡을 처리.
//
// 예전에는 stale 회수도 attemptCount 를 올려서, 5번 회수되면 DEAD 가 됐다.
// 그런데 워커가 죽는 건(서버리스 300초 제한 등) 문서 잘못이 아니다.
// 실측: DEAD 49건 중 47건이 WORKER_STALE_TIMEOUT 이었다 — 진짜 오류는 2건뿐.
// 오래 걸리는 문서일수록 확실히 죽으니, 큰 문서가 영원히 수집 안 되는 구조였다.
//
// 이제 진짜 실패(markJobFailed, 5회)와 회수(stale, 20회)를 따로 센다.
// 회수 한도를 아예 없애면 영영 도는 잡을 못 걸러내므로 한도는 남긴다.
export interface StaleRecoveryResult {
  recovered: number; // RETRY로 돌린 개수
  deadened: number; // DEAD로 표시한 개수
}
export async function recoverStaleJobs(stallMinutes: number = 15): Promise<StaleRecoveryResult> {
  const threshold = new Date(Date.now() - stallMinutes * 60_000);
  // 트랜잭션: 먼저 조회 후 각각 upsert 처리
  return prisma.$transaction(async (tx) => {
    const stale = await tx.collectorJob.findMany({
      where: {
        status: "RUNNING",
        lockedAt: { lt: threshold },
      },
      select: { id: true, attemptCount: true, payload: true },
    });
    if (stale.length === 0) return { recovered: 0, deadened: 0 };

    let recovered = 0;
    let deadened = 0;
    for (const j of stale) {
      const staleCount = readStaleCount(j.payload) + 1;
      if (staleCount >= MAX_STALE_RECOVERIES) {
        await tx.collectorJob.update({
          where: { id: j.id },
          data: {
            status: "DEAD",
            finishedAt: new Date(),
            payload: withStaleCount(j.payload, staleCount) as Prisma.InputJsonValue,
            lockedAt: null,
            lockedBy: null,
            startedAt: null,
            lastError: `WORKER_STALE_TIMEOUT (회수 ${staleCount}회 초과)`,
          },
        });
        deadened += 1;
      } else {
        await tx.collectorJob.update({
          where: { id: j.id },
          data: {
            status: "RETRY",
            // attemptCount 는 건드리지 않는다. 진짜 실패가 아니다.
            payload: withStaleCount(j.payload, staleCount) as Prisma.InputJsonValue,
            nextRunAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            startedAt: null,
            lastError: `WORKER_STALE_TIMEOUT (회수 ${staleCount}회)`,
          },
        });
        recovered += 1;
      }
    }
    return { recovered, deadened };
  });
}

// 큐잉 유틸 — 활성 중복은 partial unique로 DB가 막지만, 앱 레벨에서도 우아하게 처리
export interface EnqueueOptions {
  jobType: string;
  sourceType: string;
  sourceId: string;
  payload?: unknown;
}
export async function enqueueJob(opts: EnqueueOptions): Promise<"enqueued" | "already_active"> {
  try {
    await prisma.collectorJob.create({
      data: {
        jobType: opts.jobType,
        sourceType: opts.sourceType,
        sourceId: opts.sourceId,
        status: "PENDING",
        payload: (opts.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return "enqueued";
  } catch (err) {
    // Postgres 23505 = unique violation → 이미 활성 잡 존재
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return "already_active";
    }
    throw err;
  }
}

export async function cleanupCompletedJobs(daysToKeep: number = 30): Promise<number> {
  const threshold = new Date(Date.now() - daysToKeep * 24 * 60 * 60_000);
  const result = await prisma.collectorJob.deleteMany({
    where: {
      status: "DONE",
      finishedAt: { lt: threshold },
    },
  });
  return result.count;
}
