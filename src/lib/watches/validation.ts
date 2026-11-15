// Watch mutation 입력 검증. Zod 로 allowlist 강제.
// Prisma error 를 사용자 검증으로 사용하지 않는다.

import { z } from "zod";
import { APPLICABILITY_VALUES, IMPORTANCE_VALUES, REVIEW_FREQUENCY_VALUES } from "./labels";

// createOrReactivate 입력 — documentId 만 필수. 나머지는 후속 update.
export const createWatchInput = z.object({
  documentId: z.string().min(1),
});
export type CreateWatchInput = z.infer<typeof createWatchInput>;

// update 입력 — 부분 업데이트. undefined 는 무변경, null 은 명시적 clear.
export const updateWatchInput = z.object({
  applicabilityStatus: z.enum(APPLICABILITY_VALUES).optional(),
  applicabilityReason: z.string().max(2000).nullable().optional(),
  importance: z.enum(IMPORTANCE_VALUES).optional(),
  ownerDepartmentId: z.string().min(1).nullable().optional(),
  ownerMemberId: z.string().min(1).nullable().optional(),
  reviewFrequencyMonths: z
    .union([
      z.literal(0), z.literal(1), z.literal(3), z.literal(6), z.literal(12),
    ])
    .nullable()
    .optional(),
  notifyOnChange: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  folderId: z.string().min(1).nullable().optional(),
});
export type UpdateWatchInput = z.infer<typeof updateWatchInput>;

export const REVIEW_FREQUENCY_ENUM = REVIEW_FREQUENCY_VALUES;
