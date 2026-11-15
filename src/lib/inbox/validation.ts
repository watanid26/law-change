// ChangeInboxItem mutation 입력 검증.

import { z } from "zod";
import {
  INBOX_APPLICABILITY_VALUES,
  IMPACT_LEVEL_VALUES,
  INBOX_STATUS_VALUES,
} from "./labels";

// 상태 전환 요청.
// 서비스 레이어에서 valid transition 여부 재검증.
export const transitionInboxInput = z.object({
  status: z.enum(INBOX_STATUS_VALUES),
});
export type TransitionInboxInput = z.infer<typeof transitionInboxInput>;

// 검토 결과 저장 (applicability / impact / assessmentText / 담당자·부서)
export const assessInboxInput = z.object({
  applicability: z.enum(INBOX_APPLICABILITY_VALUES).optional(),
  applicabilityReason: z.string().max(2000).nullable().optional(),
  impactLevel: z.enum(IMPACT_LEVEL_VALUES).nullable().optional(),
  assessmentText: z.string().max(4000).nullable().optional(),
  ownerDepartmentId: z.string().min(1).nullable().optional(),
  assignedToMemberId: z.string().min(1).nullable().optional(),
});
export type AssessInboxInput = z.infer<typeof assessInboxInput>;
