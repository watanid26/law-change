import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const g = await p.collectorJob.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("=== ALL JOB STATUSES ===");
  for (const r of g) console.log(`  ${r.status}: ${r._count._all}`);
  // top pending jobs by next_run_at (queue head)
  const head = await p.collectorJob.findMany({
    where: { status: { in: ["PENDING", "RETRY"] } },
    orderBy: [{ nextRunAt: "asc" }, { createdAt: "asc" }],
    take: 10,
    select: { id: true, jobType: true, sourceType: true, sourceId: true, status: true, attemptCount: true, lastError: true },
  });
  console.log("\n=== QUEUE HEAD (top 10 to be pickup) ===");
  for (const j of head) {
    const err = j.lastError ? j.lastError.slice(0, 60) : "";
    console.log(`  ${j.status} attempt=${j.attemptCount} src=${j.sourceType}/${j.sourceId} err='${err}'`);
  }
  await p.$disconnect();
})();
