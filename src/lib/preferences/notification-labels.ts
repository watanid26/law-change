// Notification preference 라벨/enum/타입 — 클라이언트/서버 공용.
// 이 파일은 prisma 를 import 하지 않는다.
// 라운드 9 QA: NotificationPreferenceForm(client) 가 notification.ts 를 import 하면서
// prisma 가 브라우저 번들에 유출되어 83초 Long Task 를 유발한 문제 대응.

import { z } from "zod";

export const DIGEST_MODES = ["IMMEDIATE", "DAILY", "WEEKLY", "OFF"] as const;
export type DigestMode = (typeof DIGEST_MODES)[number];

export const DIGEST_MODE_LABEL: Record<DigestMode, string> = {
  IMMEDIATE: "즉시",
  DAILY: "일간 요약",
  WEEKLY: "주간 요약",
  OFF: "발송 안 함",
};

/** 고르면 무슨 일이 일어나는지. 설정 화면에서 선택값 아래에 보여준다. */
export const DIGEST_MODE_DESC: Record<DigestMode, string> = {
  IMMEDIATE: "변경이 감지되는 대로 한 건씩 보냅니다.",
  DAILY: "하루치를 모아 하루 한 번 보냅니다. 그날 변경이 없으면 보내지 않습니다.",
  WEEKLY: "일주일치를 모아 주 한 번 보냅니다. 그 주에 변경이 없으면 보내지 않습니다.",
  OFF: "이메일을 보내지 않습니다. 변경 내역은 변경 알림 화면에서 확인할 수 있습니다.",
};

export const updatePreferenceInput = z.object({
  changeInApp: z.boolean().optional(),
  changeEmail: z.boolean().optional(),
  reminderInApp: z.boolean().optional(),
  reminderEmail: z.boolean().optional(),
  digestMode: z.enum(DIGEST_MODES).optional(),
});
export type UpdatePreferenceInput = z.infer<typeof updatePreferenceInput>;
