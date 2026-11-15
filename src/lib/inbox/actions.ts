"use server";

// Inbox mutation Server Actions.
// UI 는 이것만 호출. 세션에서 workspaceId 확보.

import { requireUserContext } from "@/lib/auth/session";
import {
  assessInboxItem,
  InboxServiceError,
  openInboxItem,
  transitionInboxItem,
} from "./service";
import { assessInboxInput, transitionInboxInput } from "./validation";

type ActionResult = { ok: true } | { ok: false; error: string };

const KO_ERROR: Record<string, string> = {
  INBOX_NOT_FOUND: "변경 항목을 찾을 수 없거나 접근 권한이 없습니다.",
  INVALID_TRANSITION: "이 상태에서 요청한 상태로 전환할 수 없습니다.",
  MEMBER_NOT_IN_WORKSPACE: "담당자를 찾을 수 없습니다.",
  DEPARTMENT_NOT_IN_WORKSPACE: "담당 부서를 찾을 수 없습니다.",
};

function toUserError(err: unknown): string {
  if (err instanceof InboxServiceError) return KO_ERROR[err.code] ?? "요청을 처리할 수 없습니다.";
  console.error("[inbox action] unexpected:", (err as Error)?.name);
  return "요청을 처리할 수 없습니다.";
}

export async function openInboxItemAction(inboxId: string): Promise<ActionResult> {
  if (typeof inboxId !== "string" || inboxId.length === 0) return { ok: false, error: "잘못된 요청입니다." };
  try {
    const ctx = await requireUserContext();
    await openInboxItem({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, inboxId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

export async function transitionInboxAction(inboxId: string, raw: unknown): Promise<ActionResult> {
  const parsed = transitionInboxInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "잘못된 상태 요청입니다." };
  try {
    const ctx = await requireUserContext();
    await transitionInboxItem({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, inboxId, parsed.data.status);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

export async function assessInboxAction(inboxId: string, raw: unknown): Promise<ActionResult> {
  const parsed = assessInboxInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "입력 값이 올바르지 않습니다." };
  try {
    const ctx = await requireUserContext();
    await assessInboxItem({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, inboxId, parsed.data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}
