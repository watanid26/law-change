// 라운드 19-A: 변경 감지 → 인박스 파이프라인 진단.
// 특정 법령 제목(부분 일치)을 받아 5단계 게이트를 하나씩 검사해 어디서 끊겼는지 리포트.
//
// 사용: npx tsx scripts/db/diagnose-fanout.ts "정보통신망"
// 또는: npx tsx scripts/db/diagnose-fanout.ts "개인정보 보호법"

import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";

function ok(msg: string) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function warn(msg: string) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function fail(msg: string) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function info(msg: string) { console.log(`  ${DIM}${msg}${RESET}`); }
function heading(msg: string) { console.log(`\n${BOLD}${CYAN}${msg}${RESET}`); }

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error("Usage: npx tsx scripts/db/diagnose-fanout.ts <법령명 부분 문자열>");
    process.exit(1);
  }

  heading(`[1/6] 법령 찾기 — "${query}"`);
  const docs = await p.legalDocument.findMany({
    where: { currentTitle: { contains: query } },
    select: {
      id: true,
      currentTitle: true,
      documentType: true,
      externalDocumentId: true,
      _count: { select: { changeEvents: true, watches: true } },
    },
    take: 10,
  });
  if (docs.length === 0) {
    fail("일치하는 법령 없음. seed 됐는지 확인.");
    await p.$disconnect();
    return;
  }
  docs.forEach((d) => {
    info(`${d.id} · ${d.currentTitle} (${d.documentType}) · events=${d._count.changeEvents} watches=${d._count.watches}`);
  });
  const doc = docs[0];
  console.log(`\n${DIM}→ 첫 매치로 진단 진행: ${doc.currentTitle}${RESET}`);

  heading(`[2/6] ChangeEvent 조사 (최근 10건)`);
  const events = await p.legalChangeEvent.findMany({
    where: { documentId: doc.id },
    orderBy: { detectedAt: "desc" },
    take: 10,
    select: {
      id: true,
      eventType: true,
      discoveryType: true,
      notificationEligible: true,
      status: true,
      effectiveDate: true,
      detectedAt: true,
    },
  });
  if (events.length === 0) {
    fail("이 법령에 ChangeEvent 자체가 없음. 감지 파이프라인이 이 법령을 처리한 적 없음.");
    info("→ 원인 후보: sync가 안 돔 / 법령이 오래된 상태로 seed 된 뒤 재sync 안 됨");
  } else {
    events.forEach((e) => {
      const eligible = e.notificationEligible ? `${GREEN}notify=T${RESET}` : `${RED}notify=F${RESET}`;
      const eff = e.effectiveDate ? e.effectiveDate.toISOString().slice(0, 10) : "null";
      const det = e.detectedAt.toISOString().slice(0, 10);
      info(`${e.id.slice(0, 12)} · ${e.eventType.padEnd(12)} · ${e.discoveryType.padEnd(20)} · ${eligible} · eff=${eff} · detected=${det}`);
    });

    const notifiable = events.filter((e) => e.notificationEligible && e.status === "PUBLISHED");
    if (notifiable.length === 0) {
      fail(`${events.length}건 중 notify 가능한 이벤트 0건. ${BOLD}이게 근본 원인일 확률 매우 높음.${RESET}`);
      info(`→ 모든 이벤트가 HISTORICAL_IMPORT 또는 RECONCILIATION_RECOVERY 로 들어와서 notificationEligible=false`);
      info(`→ 해결: (a) 미래 시행일이 남은 이벤트는 소급 eligible=true 로 승격 (b) 신규 감지 로직 확인`);
    } else {
      ok(`notify 가능 이벤트 ${notifiable.length}건 존재`);
    }
  }

  heading(`[3/6] Watch 조사 (이 법령 관심 등록 상태)`);
  const watches = await p.watch.findMany({
    where: { documentId: doc.id },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      notifyOnChange: true,
      archivedAt: true,
      workspace: { select: { name: true, status: true } },
    },
  });
  if (watches.length === 0) {
    fail("이 법령을 관심 등록한 Watch 자체가 없음.");
    info("→ 사용자가 실제로 이 법령을 적용법규대장에 등록했는지 확인");
  } else {
    watches.forEach((w) => {
      const wsStatus = w.workspace.status === "ACTIVE" ? GREEN : RED;
      const wStatus = w.status === "ACTIVE" ? GREEN : RED;
      const notify = w.notifyOnChange ? GREEN : RED;
      const archived = w.archivedAt ? `${RED}archived${RESET}` : `${GREEN}live${RESET}`;
      info(`${w.id.slice(0, 12)} · ws=${w.workspace.name}(${wsStatus}${w.workspace.status}${RESET}) · watch=${wStatus}${w.status}${RESET} · notify=${notify}${w.notifyOnChange}${RESET} · ${archived}`);
    });

    const eligible = watches.filter(
      (w) =>
        w.status === "ACTIVE" &&
        w.notifyOnChange &&
        w.archivedAt === null &&
        w.workspace.status === "ACTIVE"
    );
    if (eligible.length === 0) {
      fail("모든 Watch가 fanout 자격 미달 (status/notifyOnChange/archived/workspace 중 하나 이상).");
    } else {
      ok(`fanout 자격 있는 Watch ${eligible.length}건`);
    }
  }

  heading(`[4/6] ChangeInboxItem 실제 생성 여부`);
  const inboxItems = await p.changeInboxItem.findMany({
    where: { changeEvent: { documentId: doc.id } },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      changeEventId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (inboxItems.length === 0) {
    fail("이 법령의 변경 내역 인박스 아이템 0건 — fanout 이 실행되지 않았거나 실행되었으나 자격이 없었음.");
  } else {
    inboxItems.forEach((i) => {
      info(`${i.id.slice(0, 12)} · ws=${i.workspaceId.slice(0, 8)} · status=${i.status} · created=${i.createdAt.toISOString().slice(0, 10)}`);
    });
    ok(`인박스 아이템 ${inboxItems.length}건 존재`);
  }

  heading(`[5/6] domain_outbox 상태 (이 법령 이벤트들)`);
  const eventIds = events.map((e) => e.id);
  if (eventIds.length > 0) {
    const outbox = await p.$queryRawUnsafe<
      Array<{ id: string; aggregate_id: string; status: string; attempt_count: number; last_error: string | null; processed_at: Date | null; created_at: Date }>
    >(`
      SELECT id, aggregate_id, status, attempt_count, last_error, processed_at, created_at
      FROM domain_outbox
      WHERE aggregate_type = 'LegalChangeEvent' AND aggregate_id = ANY($1::text[])
      ORDER BY created_at DESC
      LIMIT 20
    `, eventIds);
    if (outbox.length === 0) {
      fail("outbox 에 이 이벤트들이 없음 — enqueueMissingOutboxRows 가 안 돌았거나 이벤트가 eligible=false 로 걸러짐.");
    } else {
      outbox.forEach((o) => {
        const s = o.status === "DONE" ? GREEN : o.status === "FAILED" || o.status === "DEAD" ? RED : YELLOW;
        info(`${o.id.slice(0, 12)} · event=${o.aggregate_id.slice(0, 12)} · ${s}${o.status}${RESET} · attempts=${o.attempt_count}${o.last_error ? ` · err="${o.last_error.slice(0, 60)}"` : ""}`);
      });
    }
  }

  heading(`[6/6] 최근 크론 실행 흔적 (JobRun 등)`);
  try {
    const recentRuns = await p.$queryRawUnsafe<Array<{ job_name: string; status: string; started_at: Date; completed_at: Date | null }>>(`
      SELECT job_name, status, started_at, completed_at
      FROM job_run
      ORDER BY started_at DESC
      LIMIT 10
    `);
    if (recentRuns.length === 0) {
      warn("job_run 테이블 비어있음 — 크론이 실행된 흔적 없음.");
    } else {
      recentRuns.forEach((r) => {
        info(`${r.job_name.padEnd(30)} · ${r.status.padEnd(10)} · started=${r.started_at.toISOString().slice(0, 16)}`);
      });
    }
  } catch (e) {
    warn(`job_run 테이블 없음 (설정 안 됨) — ${(e as Error).message.slice(0, 80)}`);
  }

  console.log(`\n${BOLD}${CYAN}=== 진단 요약 ===${RESET}`);
  console.log("각 스테이지에서 '✗' 로 표시된 첫 지점이 파이프라인 단절점입니다.");
  console.log("가장 흔한 근본 원인: 초기 시딩 시 HISTORICAL_IMPORT 로 들어온 이벤트는 notify 안 됨.\n");

  await p.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
