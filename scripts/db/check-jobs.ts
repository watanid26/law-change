import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const jobs = await p.collectorJob.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("Job queue:");
  for (const j of jobs) console.log(`  ${j.status}: ${j._count._all}`);
  await p.$disconnect();
}
main().catch(err => { console.error(err); process.exit(1); });
