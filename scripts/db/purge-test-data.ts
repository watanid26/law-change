// 라운드 19-B1: 프로덕션 DB 에 남아있는 테스트 데이터 삭제.
// 심사 지적: "테스트 업무 R7", "R6/R7 테스트 사규", 의도적으로 긴 테스트 제목 등이 실화면 노출.
// 코드베이스는 clean 이므로 실제 DB 레코드를 정리해야 함.
//
// 사용 (DATABASE_URL 이 .env.local 에 있으므로 반드시 preload 할 것.
//       안 하면 findMany 에서 "Environment variable not found" 로 죽는다):
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/db/purge-test-data.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/db/purge-test-data.ts --apply

import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

// 테스트 데이터로 판단되는 패턴. 실무 데이터에 이런 문자열이 들어갈 여지가 극히 낮음.
//
// 라운드 31: R19 판 패턴이 "테스트 R" 처럼 **공백이 있는** 형태만 잡아서
// "R24테스트정책1" 같은 붙여쓴 라운드 접두사를 통째로 놓쳤다.
// 정규식으로 바꿔서 R<숫자> 접두사·접미사를 공백 유무와 무관하게 잡는다.
const TEST_PATTERNS = [
  "이것은 의도적으로",
  "테스트 사규",
  "테스트 업무",
  "테스트 정책",
  "테스트용",
  "샘플 데이터",
  "dummy",
  "lorem ipsum",
];

// 라운드 번호가 붙은 시드 데이터: "R24테스트정책1", "테스트 R7", "라운드 20 정책" 등.
const ROUND_TAG = /\bR\d{1,3}\s*(테스트|test)|(테스트|test)\s*R\d{1,3}\b|라운드\s*\d{1,3}/i;

// 실존하지 않는 예시 도메인. 사규의 "열기 →" 링크가 여기로 가면 100% 더미.
const PLACEHOLDER_HOST =
  /(^|\/\/|@)(example\.(com|org|net)|test\.local|localhost|intranet\.example)/i;

function containsTestPattern(s: string | null | undefined): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  if (TEST_PATTERNS.some((p) => lower.includes(p.toLowerCase()))) return true;
  return ROUND_TAG.test(s) || PLACEHOLDER_HOST.test(s);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const mode = apply ? `${BOLD}${YELLOW}APPLY${RESET}` : `${BOLD}${CYAN}DRY-RUN${RESET}`;
  console.log(`\n${mode} · 테스트 데이터 퍼지\n`);

  // Task 스캔.
  // 라운드 31: Prisma `contains` 로는 정규식 패턴(R\d+, 예시 도메인)을 못 태운다.
  // 활성 레코드를 다 읽어와서 containsTestPattern 으로 거른다.
  // (워크스페이스당 업무 수는 수천 건 규모라 전량 스캔해도 부담 없음.)
  const tasks = (
    await p.task.findMany({
      where: { archivedAt: null },
      select: { id: true, workspaceId: true, title: true, description: true, createdAt: true },
    })
  ).filter((t) => containsTestPattern(t.title) || containsTestPattern(t.description));
  console.log(`${BOLD}[Task]${RESET} 매치: ${tasks.length}건`);
  tasks.slice(0, 10).forEach((t) => {
    console.log(`  ${DIM}${t.id.slice(0, 12)}${RESET} · ws=${t.workspaceId.slice(0, 8)} · "${t.title.slice(0, 60)}"`);
  });
  if (tasks.length > 10) console.log(`  ${DIM}... 외 ${tasks.length - 10}건${RESET}`);

  // InternalPolicy 스캔
  // 라운드 31: title 뿐 아니라 문서 URL 도 검사한다.
  // "R24테스트정책1" 의 열기 링크가 https://intranet.example.com/r24-1 이었는데
  // 제목만 보던 R19 판은 이 축을 아예 안 봤다.
  const policies = (
    await p.internalPolicy.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        type: true,
        externalUrl: true,
        createdAt: true,
      },
    })
  ).filter((r) => containsTestPattern(r.title) || containsTestPattern(r.externalUrl));
  console.log(`\n${BOLD}[InternalPolicy]${RESET} 매치: ${policies.length}건`);
  policies.slice(0, 10).forEach((p) => {
    const url = p.externalUrl ? ` ${DIM}→ ${p.externalUrl}${RESET}` : "";
    console.log(`  ${DIM}${p.id.slice(0, 12)}${RESET} · ws=${p.workspaceId.slice(0, 8)} · "${p.title.slice(0, 60)}"${url}`);
  });

  // Watch 스캔 — 법령 제목은 collector 가 관리하므로 Watch 자체엔 테스트 데이터 없을 가능성.
  // 그래도 note/reason 등에 테스트 문구가 있을 수 있어 스캔.
  const watches = (
    await p.watch.findMany({
      where: { archivedAt: null },
      select: { id: true, workspaceId: true, applicabilityReason: true },
    })
  ).filter((w) => containsTestPattern(w.applicabilityReason));
  console.log(`\n${BOLD}[Watch]${RESET} applicabilityReason 매치: ${watches.length}건`);

  const total = tasks.length + policies.length + watches.length;
  console.log(`\n${BOLD}총 매치: ${total}건${RESET}\n`);

  if (total === 0) {
    console.log(`${GREEN}✓${RESET} 프로덕션 DB 에 테스트 데이터 없음. 이미 clean.\n`);
    await p.$disconnect();
    return;
  }

  if (!apply) {
    console.log(`${YELLOW}Dry-run 종료.${RESET} 실제 삭제하려면 ${BOLD}--apply${RESET} 로 재실행.\n`);
    await p.$disconnect();
    return;
  }

  // 실제 archive (hard-delete 대신 soft-delete — 감사 흔적 유지)
  console.log(`${YELLOW}archive 실행 중...${RESET}`);
  const now = new Date();

  const taskResult = tasks.length > 0
    ? await p.task.updateMany({
        where: { id: { in: tasks.map((t) => t.id) } },
        data: { archivedAt: now },
      })
    : { count: 0 };

  const policyResult = policies.length > 0
    ? await p.internalPolicy.updateMany({
        where: { id: { in: policies.map((p) => p.id) } },
        data: { archivedAt: now, status: "ARCHIVED" },
      })
    : { count: 0 };

  console.log(`${GREEN}✓${RESET} Task archived: ${taskResult.count}건`);
  console.log(`${GREEN}✓${RESET} Policy archived: ${policyResult.count}건`);
  console.log(`\nWatch 는 applicabilityReason 만 비우기 (Watch 자체는 유지):`);
  for (const w of watches) {
    await p.watch.update({
      where: { id: w.id },
      data: { applicabilityReason: null },
    });
    console.log(`  ${DIM}${w.id.slice(0, 12)}${RESET} reason cleared`);
  }
  console.log();

  await p.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
