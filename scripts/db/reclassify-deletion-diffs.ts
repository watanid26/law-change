/**
 * 일회성 마이그레이션 스크립트:
 * DB 에 이미 MOVED 로 저장된 legal_diff 중, 실제 newText 가 "제N조 삭제 <YYYY. M. D.>"
 * 뿐인 조문을 DELETED 로 재분류한다. 라운드 6 QA (010146 제43조) 등의 소급 처리.
 *
 * 사용법:
 *   pnpm ts-node scripts/db/reclassify-deletion-diffs.ts --dry-run
 *   pnpm ts-node scripts/db/reclassify-deletion-diffs.ts --apply
 *
 * UI 층에는 lawDetail.ts 에서 런타임 재분류 방어가 이미 적용됐다. 이 스크립트는
 * DB 카운트(전체/변경 유형별 배지)와 collector 재실행 시의 idempotency 를 위한
 * "진짜 데이터 정합성" 이 목적.
 */
import { PrismaClient } from "@prisma/client";
import { isDeletionMarker } from "../../src/lib/collector/diff";

const prisma = new PrismaClient();

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const dryRun = !apply;

  console.log(`[reclassify] ${dryRun ? "DRY RUN" : "APPLY"} mode`);

  // MOVED 로 저장된 조문 전수 조회
  const rows = await prisma.legalDiff.findMany({
    where: { changeType: "MOVED" },
    select: { id: true, changeEventId: true, newLabel: true, oldLabel: true, newText: true },
  });
  console.log(`[reclassify] Found ${rows.length} MOVED diffs`);

  const toDelete: typeof rows = [];
  for (const r of rows) {
    if (r.newText && isDeletionMarker(r.newText)) {
      toDelete.push(r);
    }
  }
  console.log(`[reclassify] ${toDelete.length} of them are actually DELETED (body = 삭제)`);

  if (toDelete.length === 0) {
    console.log("[reclassify] Nothing to do.");
    return;
  }

  // 각 이벤트별로 몇 개가 재분류되는지 요약
  const byEvent = new Map<string, number>();
  for (const r of toDelete) {
    byEvent.set(r.changeEventId, (byEvent.get(r.changeEventId) ?? 0) + 1);
  }
  console.log(`[reclassify] Affects ${byEvent.size} change events`);

  // 샘플 몇 개 출력
  const sample = toDelete.slice(0, 5);
  for (const r of sample) {
    console.log(`  · ${r.newLabel ?? r.oldLabel} — "${r.newText?.slice(0, 60)}..."`);
  }

  if (dryRun) {
    console.log("[reclassify] Dry run only. Re-run with --apply to write changes.");
    return;
  }

  // 실제 업데이트: changeType 변경 + 이벤트별 카운트 재조정
  const ids = toDelete.map((r) => r.id);
  await prisma.$transaction(async (tx) => {
    // 1) diff.change_type MOVED → DELETED
    await tx.legalDiff.updateMany({
      where: { id: { in: ids } },
      data: { changeType: "DELETED" },
    });
    console.log(`[reclassify] Updated ${ids.length} diffs → DELETED`);

    // 2) 이벤트별 movedCount 감소 + deletedCount 증가
    for (const [eventId, count] of byEvent) {
      await tx.legalChangeEvent.update({
        where: { id: eventId },
        data: {
          movedCount: { decrement: count },
          deletedCount: { increment: count },
        },
      });
    }
    console.log(`[reclassify] Adjusted counts for ${byEvent.size} events`);
  });

  console.log("[reclassify] Done.");
}

main()
  .catch((err) => {
    console.error("[reclassify] failed", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
