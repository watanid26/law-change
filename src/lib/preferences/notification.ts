// NotificationPreference — 사용자별 알림 설정 조회/저장 (서버 전용).
// 라벨·enum·zod 스키마는 notification-labels.ts 에 분리해 client 도 안전하게 import.
//
// 이 파일이 client 번들에 유출되면 prisma 가 브라우저에서 실행되며 무한 재시도 루프 →
// 라운드 9 QA 에서 83초 Long Task 로 관측됐음. server-only 임포트 가드로 방어.

import "server-only";
import { prisma } from "@/lib/prisma";
import type { UpdatePreferenceInput } from "./notification-labels";

// UPSERT: member 최초 조회 시 default 로 생성.
export async function getOrCreatePreference(memberId: string) {
  return prisma.notificationPreference.upsert({
    where: { workspaceMemberId: memberId },
    // 이메일이 유일한 채널이므로 기본 ON. (스키마 default 는 인앱 시절의 false)
    create: { workspaceMemberId: memberId, changeEmail: true, reminderEmail: true },
    update: {},
  });
}

export async function updatePreference(memberId: string, input: UpdatePreferenceInput) {
  await prisma.notificationPreference.upsert({
    where: { workspaceMemberId: memberId },
    create: {
      workspaceMemberId: memberId,
      changeEmail: true,
      reminderEmail: true,
      ...input,
    },
    update: input,
  });
}

// 하위호환 re-export — 기존 import 경로 살려두되 client 는 못 씀 (server-only 가드).
export { DIGEST_MODES, DIGEST_MODE_LABEL, updatePreferenceInput } from "./notification-labels";
export type { DigestMode, UpdatePreferenceInput } from "./notification-labels";
