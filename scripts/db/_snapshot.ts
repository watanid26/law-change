import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const jobs = await p.collectorJob.groupBy({ by: ["status"], _count: { _all: true } });
  const docs = await p.legalDocument.count();
  const bp = await p.bootstrapProgress.findMany({
    select: { sourceType: true, scope: true, status: true, cursorPage: true, matchedCount: true, totalCount: true, rawScannedCount: true, updatedAt: true },
  });
  console.log("=== JOB QUEUE ===");
  for (const j of jobs) console.log(`  ${j.status}: ${j._count._all}`);
  console.log(`\n=== legalDocument: ${docs} ===\n`);
  console.log("=== BOOTSTRAP PROGRESS ===");
  for (const b of bp) {
    console.log(
      `  ${b.sourceType}/${b.scope}: status=${b.status} page=${b.cursorPage} matched=${b.matchedCount}/${b.totalCount} scanned=${b.rawScannedCount} @${b.updatedAt.toISOString()}`,
    );
  }
  await p.$disconnect();
})();
