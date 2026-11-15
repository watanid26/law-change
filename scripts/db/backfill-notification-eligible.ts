// 라운드 19-A: notificationEligible 백필.
//
// 문제: detail.ts 의 `notifyEligible = eventDiscovery === "LIVE_DETECTION"` 조건 때문에
// HISTORICAL_IMPORT 로 들어온 이벤트는 아무리 미래 시행일이라도 notify 안 됨.
// 결과: 정보통신망법 D-40 개정 같은 실제 임박 사건이 인박스에 안 뜸.
//
// 처리: effectiveDate 가 미래 시점인 PUBLISHED 이벤트를 소급 승격.
//   - notification_eligible: false → true
//   - detected_at: NOW() 로 갱신 (outbox 인큐어의 30일 창에 들어오도록)
//
// 사용:
//   npx tsx scripts/db/backfill-notification-eligible.ts          # Dry-run (건수만)
//   npx tsx scripts/db/backfill-notification-eligible.ts --apply  # 실제 적용

import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

async function main() {
  const apply = process.argv.includes("--apply");
  const mode = apply ? `${BOLD}${YELLOW}APPLY MODE${RESET}` : `${BOLD}${CYAN}DRY-RUN${RESET}`;
  console.log(`\n${mode} · notificationEligible 백필\n`);

  // 후보 조회
  const candidates = await p.legalChangeEvent.findMany({
    where: {
      notificationEligible: false,
      status: "PUBLISHED",
      effectiveDate: { gt: new Date() },
    },
    select: {
      id: true,
      documentId: true,
      eventType: true,
      discoveryType: true,
      effectiveDate: true,
      detectedAt: true,
      document: { select: { currentTitle: true } },
    },
    orderBy: { effectiveDate: "asc" },
  });

  console.log(`후보: ${BOLD}${candidates.length}${RESET}건 (notify=false · status=PUBLISHED · effectiveDate 미래)\n`);

  if (candidates.length === 0) {
    console.log(`${DIM}대상 없음. 이미 정상 상태이거나 미래 시행일 이벤트가 없음.${RESET}`);
    await p.$disconnect();
    return;
  }

  // 상위 20건 미리보기
  console.log(`${DIM}미리보기 (최대 20건, 시행일 오름차순):${RESET}`);
  candidates.slice(0, 20).forEach((e) => {
    const eff = e.effectiveDate!.toISOString().slice(0, 10);
    const det = e.detectedAt.toISOString().slice(0, 10);
    const title = (e.document.currentTitle ?? "?").slice(0, 40);
    console.log(`  ${DIM}${e.id.slice(0, 12)}${RESET} · eff=${GREEN}${eff}${RESET} · det=${det} · ${e.eventType.padEnd(12)} · ${title}`);
  });
  if (candidates.length > 20) {
    console.log(`  ${DIM}... 외 ${candidates.length - 20}건${RESET}`);
  }
  console.log();

  // 워크스페이스별 잠재 인박스 아이템 수
  const docIds = Array.from(new Set(candidates.map((c) => c.documentId)));
  const watchesForDocs = await p.watch.groupBy({
    by: ["documentId"],
    where: {
      documentId: { in: docIds },
      status: "ACTIVE",
      notifyOnChange: true,
      archivedAt: null,
      workspace: { status: "ACTIVE" },
    },
    _count: { _all: true },
  });
  const totalPotentialInboxes = candidates.reduce((sum, e) => {
    const w = watchesForDocs.find((x) => x.documentId === e.documentId);
    return sum + (w?._count._all ?? 0);
  }, 0);

  console.log(`${BOLD}예상 인박스 생성 수:${RESET} 약 ${totalPotentialInboxes}건 (fanout 실행 시)`);
  console.log(`${DIM}(각 후보 이벤트 × 해당 문서의 자격 있는 Watch 수 합)${RESET}\n`);

  if (!apply) {
    console.log(`${YELLOW}Dry-run 종료.${RESET} 실제 적용하려면 ${BOLD}--apply${RESET} 플래그로 다시 실행.\n`);
    await p.$disconnect();
    return;
  }

  // 실제 UPDATE
  console.log(`${YELLOW}UPDATE 실행 중...${RESET}`);
  const ids = candidates.map((c) => c.id);
  const now = new Date();
  const result = await p.legalChangeEvent.updateMany({
    where: { id: { in: ids } },
    data: {
      notificationEligible: true,
      detectedAt: now, // outbox 인큐어의 30일 창에 다시 진입시키기 위해 감지 시각 갱신
    },
  });

  console.log(`${GREEN}✓ 완료:${RESET} ${result.count}건 업데이트\n`);
  console.log(`${DIM}다음 단계:${RESET}`);
  console.log(`  1. /api/cron/jobs 를 수동 트리거하거나 다음 22:30 KST 크론 대기`);
  console.log(`  2. runInboxFanout() 이 이 이벤트들을 인박스로 전개`);
  console.log(`  3. 대시보드 "검토 대기" 수치 상승 확인\n`);

  await p.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
