// LAW/ADMIN_RULE 카탈로그 bootstrap 재개 러너.
// runFullCatalogBootstrap 을 반복 호출해 남은 페이지 소진.
//
// 사용:
//   set -a; source .env.local; set +a
//   npx tsx --require ./scripts/db/_bypass-server-only.cjs scripts/db/bootstrap-runner.ts
//   SOURCE=LAW MAX_LOOPS=20 npx tsx ...

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { runFullCatalogBootstrap } from "../../src/lib/collector/orchestrator";

const SOURCE = (process.env.SOURCE ?? "LAW").toUpperCase() as "LAW" | "ADMIN_RULE";
const MAX_LOOPS = Number(process.env.MAX_LOOPS ?? "50");
const MAX_PAGES_PER_RUN = Number(process.env.MAX_PAGES_PER_RUN ?? "10");
const PAUSE_MS = Number(process.env.PAUSE_MS ?? "1000");

async function progress() {
  return prisma.bootstrapProgress.findUnique({
    where: { sourceType_scope: { sourceType: SOURCE, scope: "all" } },
    select: { cursorPage: true, status: true, matchedCount: true, totalCount: true, rawScannedCount: true },
  });
}

async function main() {
  const p0 = await progress();
  console.log(`[bootstrap-runner] SOURCE=${SOURCE} start:`, p0);

  let loop = 0;
  while (loop < MAX_LOOPS) {
    loop += 1;
    const before = await progress();
    if (before?.status === "COMPLETED") {
      console.log(`[bootstrap-runner] COMPLETED at loop=${loop}. done.`);
      break;
    }
    // 이미 RUNNING 이지만 다른 프로세스가 lock 잡고 있을 수 있음 → orchestrator 내부 stale 회수 로직 신뢰
    const t0 = Date.now();
    const report = await runFullCatalogBootstrap({
      sourceType: SOURCE,
      scope: "all",
      maxPagesPerRun: MAX_PAGES_PER_RUN,
    });
    const elapsed = Date.now() - t0;
    console.log(
      `[bootstrap-runner] loop=${loop} status=${report.status} pages=${report.pagesProcessed} scanned=${report.rawScanned} matched=${report.matched} enqueued=${report.enqueued} · ${elapsed}ms`,
    );
    if (report.status === "COMPLETED") {
      console.log(`[bootstrap-runner] scan COMPLETED. exiting.`);
      break;
    }
    if (report.status === "LOCKED") {
      console.log(`[bootstrap-runner] LOCKED — another worker holds progress. retrying after pause.`);
    }
    if (report.pagesProcessed === 0) {
      console.log(`[bootstrap-runner] no pages processed this loop — likely finished. exiting.`);
      break;
    }
    if (PAUSE_MS > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  const pEnd = await progress();
  console.log(`[bootstrap-runner] end:`, pEnd);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[bootstrap-runner] threw:", err);
  process.exit(1);
});
