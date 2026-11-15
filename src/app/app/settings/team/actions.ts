"use server";

// 라운드 19-C2: 팀 관리 Server Actions.
// 초대/역할 변경/제거는 모두 서버에서 권한 확인 후 실행. UI 는 결과만 소비.

import { revalidatePath } from "next/cache";
import { requireUserContext } from "@/lib/auth/session";
import {
  inviteMember,
  updateMemberRole,
  removeMember,
  MemberServiceError,
  memberErrorMessage,
  type WorkspaceRole,
} from "@/lib/members/service";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function inviteMemberAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "MEMBER") as WorkspaceRole;
  try {
    const ctx = await requireUserContext();
    const result = await inviteMember(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      { email, role },
    );
    revalidatePath("/app/settings/team");
    const msg =
      result.outcome === "ACTIVATED"
        ? `${email} 을 워크스페이스에 추가했습니다.`
        : result.outcome === "ALREADY_MEMBER"
          ? `${email} 은 이미 구성원입니다.`
          : `${email} 에게 초대장을 발행했습니다. (첫 로그인 시 자동 매칭)`;
    return { ok: true, message: msg };
  } catch (err) {
    if (err instanceof MemberServiceError) {
      return { ok: false, error: memberErrorMessage(err.code) };
    }
    console.error("[team/actions] invite failed:", (err as Error).message);
    return { ok: false, error: "초대 처리 중 오류가 발생했습니다." };
  }
}

export async function updateMemberRoleAction(memberId: string, role: WorkspaceRole): Promise<ActionResult> {
  try {
    const ctx = await requireUserContext();
    await updateMemberRole({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, memberId, role);
    revalidatePath("/app/settings/team");
    return { ok: true, message: "역할을 변경했습니다." };
  } catch (err) {
    if (err instanceof MemberServiceError) {
      return { ok: false, error: memberErrorMessage(err.code) };
    }
    console.error("[team/actions] update role failed:", (err as Error).message);
    return { ok: false, error: "역할 변경 중 오류가 발생했습니다." };
  }
}

export async function removeMemberAction(memberId: string): Promise<ActionResult> {
  try {
    const ctx = await requireUserContext();
    await removeMember({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, memberId);
    revalidatePath("/app/settings/team");
    return { ok: true, message: "구성원을 제거했습니다." };
  } catch (err) {
    if (err instanceof MemberServiceError) {
      return { ok: false, error: memberErrorMessage(err.code) };
    }
    console.error("[team/actions] remove failed:", (err as Error).message);
    return { ok: false, error: "제거 중 오류가 발생했습니다." };
  }
}
