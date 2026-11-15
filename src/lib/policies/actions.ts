"use server";

import { revalidatePath } from "next/cache";
import { requireUserContext } from "@/lib/auth/session";
import {
  createPolicy,
  bulkCreatePolicies,
  mapPolicyToArticle,
  mapPolicyToWatch,
  PolicyServiceError,
  removeMapping,
  savePolicyContent,
} from "./service";
import { createPolicyInput, bulkCreatePoliciesInput } from "./validation";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const KO_ERROR: Record<string, string> = {
  POLICY_NOT_FOUND: "사규를 찾을 수 없습니다.",
  WATCH_NOT_FOUND: "적용 법령을 찾을 수 없습니다.",
  MAPPING_NOT_FOUND: "연결을 찾을 수 없습니다.",
  DOCUMENT_NOT_FOUND: "법령을 찾을 수 없습니다.",
  CONTENT_UNIT_NOT_FOUND: "조문을 찾을 수 없습니다.",
};

function toUserError(err: unknown): string {
  if (err instanceof PolicyServiceError) return KO_ERROR[err.code] ?? "요청을 처리할 수 없습니다.";
  console.error("[policies action] unexpected:", (err as Error)?.name);
  return "요청을 처리할 수 없습니다.";
}

export async function createPolicyAction(raw: unknown): Promise<ActionResult<{ policyId: string }>> {
  const parsed = createPolicyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "입력 값이 올바르지 않습니다." };
  try {
    const ctx = await requireUserContext();
    const { id } = await createPolicy(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      parsed.data,
    );
    return { ok: true, data: { policyId: id } };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

export async function mapPolicyToWatchAction(watchId: string, policyId: string): Promise<ActionResult> {
  if (!watchId || !policyId) return { ok: false, error: "잘못된 요청입니다." };
  try {
    const ctx = await requireUserContext();
    await mapPolicyToWatch(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      watchId,
      policyId,
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

// 라운드 19-B2: 사규 벌크 등록. CSV 파싱은 클라이언트에서, 서버는 검증된 items 배열 수신.
export async function bulkCreatePoliciesAction(
  raw: unknown,
): Promise<ActionResult<{ createdCount: number }>> {
  const parsed = bulkCreatePoliciesInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `입력 오류: ${parsed.error.issues[0]?.message ?? "형식 확인 필요"}` };
  }
  try {
    const ctx = await requireUserContext();
    const result = await bulkCreatePolicies(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      parsed.data,
    );
    revalidatePath("/app/policies");
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

export async function removeMappingAction(mappingId: string): Promise<ActionResult> {
  if (!mappingId) return { ok: false, error: "잘못된 요청입니다." };
  try {
    const ctx = await requireUserContext();
    await removeMapping(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      mappingId,
    );
    // 어느 Watch 인지 알 수 없어 광범위 revalidate
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

// 사규 본문 저장 → 저장 즉시 근거 법령 후보를 다시 뽑는다.
export async function savePolicyContentAction(
  policyId: string,
  contentText: string,
): Promise<ActionResult> {
  if (typeof policyId !== "string" || !policyId) {
    return { ok: false, error: "사규를 찾을 수 없습니다." };
  }
  const text = String(contentText ?? "");
  // 본문이 지나치게 크면 추출도 저장도 느려진다. 사규 한 건은 이 안에 든다.
  if (text.length > 500_000) {
    return { ok: false, error: "본문이 너무 깁니다. 50만 자 이하로 나눠 올려주세요." };
  }
  try {
    const ctx = await requireUserContext();
    await savePolicyContent({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, policyId, text);
    revalidatePath(`/app/policies/${policyId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}

// 후보 목록에서 하나를 골라 연결. 조문까지 지정할 수 있다.
export async function mapPolicyToArticleAction(input: {
  policyId: string;
  documentId: string;
  contentUnitId?: string | null;
}): Promise<ActionResult> {
  if (!input?.policyId || !input?.documentId) {
    return { ok: false, error: "입력 값이 올바르지 않습니다." };
  }
  try {
    const ctx = await requireUserContext();
    await mapPolicyToArticle(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      {
        policyId: input.policyId,
        documentId: input.documentId,
        contentUnitId: input.contentUnitId ?? null,
      },
    );
    revalidatePath(`/app/policies/${input.policyId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserError(err) };
  }
}
