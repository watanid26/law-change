import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const jobs = await p.collectorJob.findMany({
    where: { lastError: { not: null }, status: { in: ["RETRY", "DEAD", "PENDING"] } },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { jobType: true, sourceType: true, sourceId: true, status: true, attemptCount: true, lastError: true, updatedAt: true },
  });
  for (const j of jobs) {
    const t = j.updatedAt.toISOString().slice(11, 19);
    const err = (j.lastError ?? "").slice(0, 100).replace(/\n/g, " ");
    console.log(`${t} ${j.status.padEnd(7)} a=${j.attemptCount} ${j.jobType} ${j.sourceType}/${j.sourceId} err='${err}'`);
  }
  await p.$disconnect();
})();
