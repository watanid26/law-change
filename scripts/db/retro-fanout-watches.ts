// 라운드 19-A2: 기존 Watch 전체에 대해 소급 fanout 실행.
// R19-A2 훅 이전에 등록된 Watch 중 미래 시행일 이벤트를 인박스에 못 받은 케이스를 소급 처리.
// idempotent — 이미 있는 InboxItem 은 UNIQUE 로 스킵.
//
// 사용: npx tsx scripts/db/retro-fanout-watches.ts

import { PrismaClient } from "@prisma/client";
import { fanoutForWatch } from "../../src/lib/inbox/service";

const p = new PrismaClient();

async function main() {
  const watches = await p.watch.findMany({
    where: {
      status: "ACTIVE",
      archivedAt: null,
      notifyOnChange: true,
      workspace: { status: "ACTIVE" },
    },
    select: { id: true, workspaceId: true, documentId: true },
  });

  console.log(`대상 Watch: ${watches.length}건\n`);

  let totalCreated = 0;
  let totalSkipped = 0;
  for (const w of watches) {
    try {
      const rep = await fanoutForWatch(w.id);
      if (rep.created > 0 || rep.skipped > 0) {
        console.log(`  ${w.id.slice(0, 12)} · doc=${w.documentId.slice(0, 12)} · created=${rep.created} skipped=${rep.skipped}`);
      }
      totalCreated += rep.created;
      totalSkipped += rep.skipped;
    } catch (err) {
      console.error(`  ${w.id.slice(0, 12)} · ERROR: ${(err as Error).message}`);
    }
  }

  console.log(`\n총 created=${totalCreated} skipped=${totalSkipped}`);
  await p.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
