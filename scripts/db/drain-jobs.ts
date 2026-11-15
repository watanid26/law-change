// 잡 큐 소진 러너. runJobBatch 를 반복 호출해 PENDING 잡을 처리한다.
// 진행률을 콘솔에 출력하며, 큐가 비거나 지정한 최대 횟수 도달 시 종료.
//
// 사용:
//   set -a; source .env.local; set +a; npx tsx scripts/db/drain-jobs.ts
//   MAX_ITER=100 npx tsx ... 로 반복 횟수 조절

// prisma.ts 에는 "server-only" 가드가 있어 Node script 에선 throw 함.
// script 용 로컬 인스턴스 생성.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
// orchestrator 는 자체적으로 prisma 를 import 하는데 그건 별개 모듈 인스턴스라 상관 없음.
import { runJobBatch } from "../../src/lib/collector/orchestrator";

const MAX_ITER = Number(process.env.MAX_ITER ?? "100");
const BATCH = Number(process.env.COLLECTOR_BATCH_SIZE ?? "15");
const PAUSE_MS = Number(process.env.PAUSE_MS ?? "500"); // 반복 사이 짧은 pause
const ITER_TIMEOUT_MS = Number(process.env.ITER_TIMEOUT_MS ?? "90000"); // iter hang 감지용

const TIMEOUT_SENTINEL: unique symbol = Symbol("TIMEOUT");
type IterResult<T> = T | typeof TIMEOUT_SENTINEL;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<IterResult<T>> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(TIMEOUT_SENTINEL), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); resolve(Promise.reject(e) as never); },
    );
  });
}

async function pendingCount() {
  return prisma.collectorJob.count({ where: { status: { in: ["PENDING", "RETRY"] } } });
}

async function docCount() {
  return prisma.legalDocument.count();
}

async function main() {
  const startPending = await pendingCount();
  const startDocs = await docCount();
  console.log(`[drain] start — pending+retry=${startPending}, legalDocument=${startDocs}, batch=${BATCH}, maxIter=${MAX_ITER}`);

  let iter = 0;
  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;

  while (iter < MAX_ITER) {
    iter += 1;
    const pending = await pendingCount();
    if (pending === 0) {
      console.log(`[drain] queue empty at iter=${iter}. done.`);
      break;
    }

    const reportOrTimeout = await withTimeout(
      runJobBatch({ batchSize: BATCH, workerLabel: `drain-${process.pid}` }),
      ITER_TIMEOUT_MS,
    );
    if (reportOrTimeout === TIMEOUT_SENTINEL) {
      console.warn(
        `[drain] iter=${iter} TIMEOUT after ${ITER_TIMEOUT_MS}ms — exiting for wrapper to restart (stale-recovery will requeue on next start)`,
      );
      await prisma.$disconnect().catch(() => {});
      process.exit(2);
    }
    const report = reportOrTimeout;
    totalProcessed += report.processed;
    totalSucceeded += report.succeeded;
    totalFailed += report.failed + report.dead;

    if (iter % 1 === 0 || report.processed === 0) {
      const nowPending = await pendingCount();
      const nowDocs = await docCount();
      console.log(
        `[drain] iter=${iter} thisRun processed=${report.processed} ok=${report.succeeded} fail=${report.failed}+dead=${report.dead} | remaining=${nowPending} docs=${nowDocs}`,
      );
    }

    if (report.processed === 0) {
      console.log(`[drain] no more processable jobs — stopping`);
      break;
    }

    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  const endPending = await pendingCount();
  const endDocs = await docCount();
  console.log(
    `[drain] done — iterations=${iter}, totalProcessed=${totalProcessed}, ok=${totalSucceeded}, fail=${totalFailed}. Δ pending: ${startPending}→${endPending}, Δ docs: ${startDocs}→${endDocs}`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[drain] threw", err);
  process.exit(1);
});
