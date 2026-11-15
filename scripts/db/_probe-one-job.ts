// 격리 테스트: processCollectorJobs 한 번만 호출해서 어디서 hang인지 timing 로그로 확인.
// 실행: set -a; source .env.local; set +a; npx tsx --require ./scripts/db/_bypass-server-only.cjs scripts/db/_probe-one-job.ts

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { processCollectorJobs } from "../../src/lib/collector/detail";

const HARD_TIMEOUT_MS = 90_000;

(async () => {
  const t0 = Date.now();
  console.log(`[probe] starting processCollectorJobs(limit=1) with ${HARD_TIMEOUT_MS}ms hard timeout`);

  const timer = setTimeout(() => {
    console.error(`[probe] HARD TIMEOUT reached after ${HARD_TIMEOUT_MS}ms — forcing exit`);
    process.exit(2);
  }, HARD_TIMEOUT_MS);

  try {
    const result = await processCollectorJobs(1, "probe");
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    console.log(`[probe] DONE in ${elapsed}ms:`, result);
  } catch (e: any) {
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    console.error(`[probe] ERROR after ${elapsed}ms:`, e?.message ?? e);
  } finally {
    await prisma.$disconnect();
  }
})();
