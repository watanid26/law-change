// Task / Evidence 입력 검증.

import { z } from "zod";
import { EVIDENCE_TYPE_VALUES, TASK_PRIORITY_VALUES, TASK_STATUS_VALUES } from "./labels";

// Inbox 로부터 Task 생성 — Inbox 있으면 그로부터 workspace/문맥 상속.
export const createTaskFromInboxInput = z.object({
  inboxItemId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  dueAt: z.string().datetime().optional(), // ISO string. null 은 미지정.
});
export type CreateTaskFromInboxInput = z.infer<typeof createTaskFromInboxInput>;

// 독립 Task (Inbox 없이 사용자가 직접 생성)
// 라운드 19-C3: assigneeMemberId 노출 — UI 담당자 드롭다운. 빈 값이면 서비스에서 본인으로 기본.
export const createStandaloneTaskInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  dueAt: z.string().datetime().optional(),
  assigneeMemberId: z.string().min(1).optional(),
});
export type CreateStandaloneTaskInput = z.infer<typeof createStandaloneTaskInput>;

export const updateTaskInput = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assigneeMemberId: z.string().min(1).nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

export const transitionTaskInput = z.object({
  status: z.enum(TASK_STATUS_VALUES),
});
export type TransitionTaskInput = z.infer<typeof transitionTaskInput>;

export const addEvidenceInput = z.object({
  type: z.enum(EVIDENCE_TYPE_VALUES),
  externalUrl: z.string().url().max(2000).nullable().optional(),
  fileReference: z.string().max(500).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
}).refine(
  (v) => !!(v.externalUrl || v.fileReference || v.description),
  { message: "링크, 파일 경로, 설명 중 하나는 반드시 있어야 합니다." },
);
export type AddEvidenceInput = z.infer<typeof addEvidenceInput>;
