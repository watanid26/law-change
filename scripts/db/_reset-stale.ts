import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const before = await p.collectorJob.count({ where: { status: "RUNNING" } });
  console.log(`RUNNING before: ${before}`);
  const res = await p.collectorJob.updateMany({
    where: { status: "RUNNING" },
    data: { status: "PENDING", lockedAt: null, lockedBy: null, startedAt: null },
  });
  console.log(`updated: ${res.count}`);
  const after = await p.collectorJob.count({ where: { status: "RUNNING" } });
  console.log(`RUNNING after: ${after}`);

  // 클라이언트가 죽었을 때 Postgres 쪽에 남은 idle-in-transaction 세션도 종료
  const term = await p.$queryRawUnsafe<any[]>(`
    SELECT pg_terminate_backend(pid) AS terminated, pid, application_name,
           EXTRACT(EPOCH FROM (now() - xact_start))::int AS xact_age_sec
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state = 'idle in transaction'
      AND application_name IN ('Supavisor', '')
      AND EXTRACT(EPOCH FROM (now() - xact_start)) > 60
  `);
  console.log("terminated idle-in-txn sessions:", term);

  await p.$disconnect();
})();
