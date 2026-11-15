"use server";

// Task / Evidence Server Actions.
// 개인 사용 기준: assignee 는 항상 자기 자신 (service 안에서 auto-set).

import { redirect } from "next/navigation";
import { requireUserContext } from "@/lib/auth/session";
import {
  addEvidence,
  createStandaloneTask,
  createTaskFromInbox,
  softDeleteEvidence,
  TaskServiceError,
  transitionTask,
  updateTask,
} from "./service";
import {
  addEvidenceInput,
  createStandaloneTaskInput,
  createTaskFromInboxInput,
  transitionTaskInput,
  updateTaskInput,
} from "./validation";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const KO_ERROR: Record<string, string> = {
  TASK_NOT_FOUND: "업무를 찾을 수 없거나 접근 권한이 없습니다.",
  INBOX_NOT_FOUND: "변경 항목을 찾을 수 없습니다.",
  EVIDENCE_NOT_FOUND: "증빙을 찾을 수 없습니다.",
  INVALID_TRANSITION: "이 상태에서 요청한 상태로 전환할 수 없습니다.",
};

function toUserError(err: unknown): string {
  if (err instanceof TaskServiceError) return KO_ERROR[err.code] ?? "요청을 처리할 수 없습니다.";
  console.error("[tasks action] unexpected:", (err as Error)?.name);
  return "요청을 처리할 수 없습니다.";
}

export async function createTaskFromInboxAction(raw: unknown): Promise<ActionResult<{ taskId: string }>> {
  const parsed = createTaskFromInboxInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "입력 값이 올바르지 않습니다." };
  try {
    const ctx = await requireUserContext();
    const { id } = await createTaskFromInbox(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      parsed.data,
    );
    return { ok: true, data: { taskId: id } };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

export async function createStandaloneTaskAction(raw: unknown): Promise<ActionResult<{ taskId: string }>> {
  const parsed = createStandaloneTaskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "입력 값이 올바르지 않습니다." };
  try {
    const ctx = await requireUserContext();
    const { id } = await createStandaloneTask(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      parsed.data,
    );
    return { ok: true, data: { taskId: id } };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

export async function updateTaskAction(taskId: string, raw: unknown): Promise<ActionResult> {
  const parsed = updateTaskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "입력 값이 올바르지 않습니다." };
  try {
    const ctx = await requireUserContext();
    await updateTask({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, taskId, parsed.data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

export async function transitionTaskAction(taskId: string, raw: unknown): Promise<ActionResult> {
  const parsed = transitionTaskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "잘못된 상태 요청입니다." };
  try {
    const ctx = await requireUserContext();
    await transitionTask(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      taskId,
      parsed.data.status,
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

export async function addEvidenceAction(taskId: string, raw: unknown): Promise<ActionResult<{ evidenceId: string }>> {
  const parsed = addEvidenceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력 값이 올바르지 않습니다." };
  try {
    const ctx = await requireUserContext();
    const { id } = await addEvidence(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      taskId,
      parsed.data,
    );
    return { ok: true, data: { evidenceId: id } };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

export async function deleteEvidenceAction(evidenceId: string): Promise<ActionResult> {
  if (typeof evidenceId !== "string" || evidenceId.length === 0) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  try {
    const ctx = await requireUserContext();
    await softDeleteEvidence({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, evidenceId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

// Inbox 상세에서 form submit → Task 생성 후 상세 페이지로 이동.
export async function createTaskFromInboxFormAction(formData: FormData): Promise<void> {
  const raw = {
    inboxItemId: String(formData.get("inboxItemId") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    description: (formData.get("description") ? String(formData.get("description")) : "") || undefined,
    priority: (formData.get("priority") ? String(formData.get("priority")) : undefined) as
      | "LOW" | "NORMAL" | "HIGH" | "URGENT" | undefined,
    dueAt: (formData.get("dueAt") ? new Date(String(formData.get("dueAt"))).toISOString() : undefined),
  };
  const res = await createTaskFromInboxAction(raw);
  if (res.ok && res.data) {
    redirect(`/app/tasks/${res.data.taskId}`);
  } else {
    // 실패 시 원 페이지로 (?error 파라미터)
    const inboxId = raw.inboxItemId;
    redirect(`/app/inbox/${inboxId}?taskError=${encodeURIComponent(!res.ok ? res.error : "unknown")}`);
  }
}
