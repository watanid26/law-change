// 이메일 단일 채널 전환 backfill.
//
// 배경: 인앱이 주 채널이던 시절의 스키마 기본값(notifyEmail=false,
// changeEmail=false) 때문에, 앱에서 만든 관심 법령과 알림 선호가 전부
// "이메일 꺼짐" 상태로 저장돼 있었다. 그 결과 개정 알림이 생성은 되는데
// delivery 가 하나도 안 만들어져 아무 데도 발송되지 않았다.
//
// 코드는 이제 생성 시점에 명시적으로 true 를 넣지만, 이미 만들어진 행은
// 이 스크립트로 한 번 올려줘야 한다.
//
// 사용:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/db/enable-email-notifications.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/db/enable-email-notifications.ts --apply

import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(
    `\n${BOLD}${apply ? YELLOW + "APPLY" : CYAN + "DRY-RUN"}${RESET} · 이메일 알림 활성화\n`,
  );

  const watches = await p.watch.count({
    where: { archivedAt: null, notifyEmail: false },
  });
  const prefs = await p.notificationPreference.count({
    where: { changeEmail: false },
  });

  console.log(`${BOLD}[Watch]${RESET}          notifyEmail=false : ${watches}건`);
  console.log(`${BOLD}[Preference]${RESET}     changeEmail=false : ${prefs}건`);

  if (watches === 0 && prefs === 0) {
    console.log(`\n${GREEN}✓${RESET} 이미 전부 활성화돼 있습니다.\n`);
    await p.$disconnect();
    return;
  }

  if (!apply) {
    console.log(`\n${YELLOW}Dry-run 종료.${RESET} 적용하려면 ${BOLD}--apply${RESET}\n`);
    await p.$disconnect();
    return;
  }

  const w = await p.watch.updateMany({
    where: { archivedAt: null, notifyEmail: false },
    data: { notifyEmail: true },
  });
  // reminderEmail 도 같은 이유로 꺼져 있으므로 함께 올린다.
  const pr = await p.notificationPreference.updateMany({
    where: { changeEmail: false },
    data: { changeEmail: true, reminderEmail: true },
  });

  console.log(`\n${GREEN}✓${RESET} Watch 활성화        : ${w.count}건`);
  console.log(`${GREEN}✓${RESET} Preference 활성화   : ${pr.count}건\n`);
  await p.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await p.$disconnect();
  process.exit(1);
});
