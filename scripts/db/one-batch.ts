// 한 번의 runJobBatch 를 실행하고 결과 즉시 출력. 병목 파악용.
import { runJobBatch } from "../../src/lib/collector/orchestrator";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[one-batch] start");
  const t0 = Date.now();
  const report = await runJobBatch({ batchSize: 3, workerLabel: `oneshot-${process.pid}` });
  const elapsed = Date.now() - t0;
  console.log(`[one-batch] done in ${elapsed}ms:`, JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[one-batch] threw:", err);
  process.exit(1);
});
