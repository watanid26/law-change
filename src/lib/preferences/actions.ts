"use server";

// 라운드 10 QA: 로컬 build 는 클라이언트 chunk 에 PrismaClient 흔적이 0건인데
// 프로덕션 배포본 (page-3aba15c930e7d983.js) 에는 여전히 유출되어 있음.
// 원인 후보 중 하나: Next.js 14 의 "use server" 파일이 클라이언트 프록시로 wrapping 될 때
// 이 파일이 import 하는 모듈 그래프까지 부분적으로 client chunk 에 딸려간다.
// notification.ts 는 prisma 를 import 하므로 이 경로가 유출 통로가 됐을 가능성.
//
// 대응: 이 액션 파일은 오직 server-only 실행 시점에 필요한 것만 import 한다.
// - zod 스키마 (updatePreferenceInput) 는 client-safe 한 notification-labels 에서.
// - 실제 DB write (updatePreference) 는 dynamic import 로 top-level import 를 회피
//   → notification.ts (그리고 그 안의 prisma) 는 오직 이 함수가 서버에서 호출될 때만 로드.

import { requireUserContext } from "@/lib/auth/session";
import { updatePreferenceInput } from "./notification-labels";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateNotificationPreferenceAction(raw: unknown): Promise<ActionResult> {
  const parsed = updatePreferenceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "입력 값이 올바르지 않습니다." };
  try {
    const ctx = await requireUserContext();
    // Dynamic import — 이 모듈이 client bundle 로 wrap 될 때 notification.ts 를
    // top-level 로 딸고 가지 않도록 (그래서 prisma 유출 경로 차단).
    const { updatePreference } = await import("./notification");
    await updatePreference(ctx.memberId, parsed.data);
    return { ok: true };
  } catch (err) {
    console.error("[preferences] unexpected:", (err as Error)?.name);
    return { ok: false, error: "요청을 처리할 수 없습니다." };
  }
}
