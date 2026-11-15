// 라운드 19-A: 인박스 fanout 을 즉시 트리거해 백필 결과를 인박스 아이템으로 전개.
// 크론 대기 없이 검증할 때 사용.
//
// 사용: npx tsx scripts/db/run-fanout.ts

import { runInboxFanout } from "../../src/lib/inbox/service";

async function main() {
  console.log("Fanout 시작...\n");
  const t0 = Date.now();
  const report = await runInboxFanout();
  const elapsed = Date.now() - t0;

  console.log("결과:");
  console.log(`  outbox 신규 인큐: ${report.outboxEnqueued}`);
  console.log(`  outbox 처리:      ${report.outboxProcessed}`);
  console.log(`  인박스 생성:      ${report.inboxCreated}`);
  console.log(`  인박스 스킵(중복): ${report.inboxSkipped}`);
  console.log(`  outbox 실패:      ${report.outboxFailed}`);
  console.log(`  소요:             ${elapsed}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
