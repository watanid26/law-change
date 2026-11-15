import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  // 현재 세션들
  const act = await p.$queryRawUnsafe<any[]>(`
    SELECT pid, application_name, state, wait_event_type, wait_event, xact_start,
           EXTRACT(EPOCH FROM (now() - query_start))::int AS query_dur_sec, LEFT(query, 200) AS query
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
    ORDER BY query_start ASC
  `);
  console.log("=== pg_stat_activity ===");
  for (const r of act) {
    console.log(
      `pid=${r.pid} state=${r.state} wait=${r.wait_event_type}/${r.wait_event} dur=${r.query_dur_sec}s app=${r.application_name}`,
    );
    console.log(`  q: ${r.query?.replace(/\s+/g, " ")}`);
  }
  console.log("");

  // RUNNING 잡 상태
  const runs = await p.collectorJob.findMany({
    where: { status: "RUNNING" },
    select: { id: true, jobType: true, sourceType: true, sourceId: true, lockedBy: true, lockedAt: true, updatedAt: true, startedAt: true },
    orderBy: { updatedAt: "asc" },
  });
  console.log(`=== RUNNING jobs: ${runs.length} ===`);
  for (const r of runs) {
    const age = r.startedAt ? Math.round((Date.now() - r.startedAt.getTime()) / 1000) : null;
    const lockAge = r.lockedAt ? Math.round((Date.now() - r.lockedAt.getTime()) / 1000) : null;
    console.log(
      `  id=${r.id} type=${r.jobType} src=${r.sourceType}/${r.sourceId} lockedBy=${r.lockedBy} lockAgeSec=${lockAge} startedAgeSec=${age}`,
    );
  }
  await p.$disconnect();
})();
