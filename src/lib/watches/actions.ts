"use server";

// Watch mutation Server Actions. UI 는 이것만 호출한다.
// - 항상 requireUserContext() 로 workspaceId 확보 (client 입력 신뢰 금지)
// - 표준 반환: { ok: true, ... } or { ok: false, error: 사용자용 메시지 }
// - Prisma raw error 는 사용자에 노출하지 않음

// revalidatePath 는 의도적으로 최소화. 대부분의 /app/* 페이지가 force-dynamic 이라
// 캐시 무효화는 불필요하고, 클라이언트가 router.refresh() 로 현재 페이지만 갱신한다.
// 지나치게 넓은 revalidatePath("/app") 를 서버 액션 응답 안에서 실행하면 대시보드의
// 병렬 쿼리 6개를 매번 재실행하며 응답 시간이 늘어져 Vercel 503 을 유발했다.
import { requireUserContext } from "@/lib/auth/session";
import {
  archiveWatch,
  createOrReactivateWatch,
  markWatchReviewed,
  updateWatch,
  WatchServiceError,
} from "./service";
import { addWatchScope, removeWatchScope } from "./scopes";
import { updateWatchInput } from "./validation";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const KO_ERROR: Record<string, string> = {
  DOCUMENT_NOT_FOUND: "법령을 찾을 수 없습니다.",
  WATCH_NOT_FOUND: "관심 등록을 찾을 수 없거나 접근 권한이 없습니다.",
  MEMBER_NOT_IN_WORKSPACE: "담당자를 찾을 수 없습니다.",
  DEPARTMENT_NOT_IN_WORKSPACE: "담당 부서를 찾을 수 없습니다.",
  FOLDER_NOT_IN_WORKSPACE: "폴더를 찾을 수 없습니다.",
};

function toUserError(err: unknown): string {
  if (err instanceof WatchServiceError) return KO_ERROR[err.code] ?? "요청을 처리할 수 없습니다.";
  // Vercel/Prisma 예외 원문을 로그에 남긴다. 이전 라운드에서 원인 없이 503 만 잡혔던 이유.
  const asErr = err as { name?: string; code?: string; message?: string; meta?: unknown };
  console.error("[watches action] unexpected", {
    name: asErr?.name,
    code: asErr?.code,
    message: asErr?.message,
    meta: asErr?.meta,
  });
  return "요청을 처리할 수 없습니다.";
}

// ─── 등록 (idempotent) ───
export async function registerWatchAction(documentId: string): Promise<ActionResult<{ watchId: string }>> {
  if (typeof documentId !== "string" || documentId.length === 0) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  try {
    const ctx = await requireUserContext();
    const { watch } = await createOrReactivateWatch(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      documentId,
    );
    return { ok: true, data: { watchId: watch.id } };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

// ─── 관심 해제 (archive, hard-delete 아님) ───
export async function archiveWatchAction(watchId: string): Promise<ActionResult> {
  if (typeof watchId !== "string" || watchId.length === 0) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  try {
    const ctx = await requireUserContext();
    await archiveWatch({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, watchId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

// ─── 상세 필드 업데이트 ───
export async function updateWatchAction(
  watchId: string,
  raw: unknown,
): Promise<ActionResult> {
  if (typeof watchId !== "string" || watchId.length === 0) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const parsed = updateWatchInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "입력 값이 올바르지 않습니다." };
  }
  try {
    const ctx = await requireUserContext();
    await updateWatch({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, watchId, parsed.data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

// ─── 검토 완료 ───
export async function markWatchReviewedAction(
  watchId: string,
): Promise<ActionResult<{ lastReviewedAt: string; nextReviewAt: string | null }>> {
  if (typeof watchId !== "string" || watchId.length === 0) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  try {
    const ctx = await requireUserContext();
    const data = await markWatchReviewed({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, watchId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

// ─── Scope (조문 단위 Watch) ───
export async function addWatchScopeAction(
  watchId: string,
  contentUnitId: string,
): Promise<ActionResult<{ scopeId: string }>> {
  if (!watchId || !contentUnitId) return { ok: false, error: "잘못된 요청입니다." };
  try {
    const ctx = await requireUserContext();
    const res = await addWatchScope(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      watchId,
      contentUnitId,
    );
    return { ok: true, data: res };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

export async function removeWatchScopeAction(scopeId: string): Promise<ActionResult> {
  if (!scopeId) return { ok: false, error: "잘못된 요청입니다." };
  try {
    const ctx = await requireUserContext();
    await removeWatchScope(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      scopeId,
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}
