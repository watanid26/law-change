// 라운드 19-C1: WorkspaceMember 도메인 서비스.
// 심사 지적 [TEAM]: 팀·권한·담당자 시스템 자체가 없음.
// MVP 스코프: 조회(list) + 초대(email로 INVITED 상태 생성) + 역할 변경.
// 실제 SSO/이메일 발송 연동은 후속 라운드(R19-C 확장).

import { prisma } from "@/lib/prisma";
import type { WorkspaceRole, MemberStatus } from "./labels";
export type { WorkspaceRole, MemberStatus } from "./labels";
export { ROLE_LABEL, STATUS_LABEL } from "./labels";

export interface WorkspaceMemberRow {
  id: string;
  userId: string;
  role: WorkspaceRole;
  status: MemberStatus;
  email: string | null;
  displayName: string | null;
  joinedAt: Date;
  isCurrentUser: boolean;
}

export class MemberServiceError extends Error {
  code:
    | "WORKSPACE_NOT_FOUND"
    | "MEMBER_NOT_FOUND"
    | "MEMBER_ALREADY_EXISTS"
    | "INSUFFICIENT_PERMISSION"
    | "CANNOT_REMOVE_LAST_OWNER"
    | "INVALID_EMAIL";
  constructor(code: MemberServiceError["code"], message?: string) {
    super(message ?? code);
    this.name = "MemberServiceError";
    this.code = code;
  }
}

export interface MemberContext {
  workspaceId: string;
  memberId: string; // 액션 수행하는 member
}

// ACTIVE + INVITED + SUSPENDED 만 노출 (LEFT 는 감사 이력용).
export async function listMembers(workspaceId: string, currentMemberId: string): Promise<WorkspaceMemberRow[]> {
  const rows = await prisma.workspaceMember.findMany({
    where: { workspaceId, status: { in: ["ACTIVE", "INVITED", "SUSPENDED"] } },
    orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      joinedAt: true,
      user: { select: { email: true, displayName: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role as WorkspaceRole,
    status: m.status as MemberStatus,
    email: m.user.email,
    displayName: m.user.displayName,
    joinedAt: m.joinedAt,
    isCurrentUser: m.id === currentMemberId,
  }));
}

// 초대 — MVP: AppUser 가 이미 존재하면 즉시 ACTIVE 로 추가, 없으면 INVITED 로 placeholder.
// email 발송·initial-login 흐름은 이후 라운드.
export async function inviteMember(
  ctx: MemberContext,
  input: { email: string; role: WorkspaceRole },
): Promise<{ memberId: string; outcome: "ACTIVATED" | "INVITED" | "ALREADY_MEMBER" }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@") || email.length < 5) {
    throw new MemberServiceError("INVALID_EMAIL");
  }
  if (input.role === "OWNER") {
    // OWNER 는 초대로 부여할 수 없음 (transfer-ownership 은 별도 액션).
    throw new MemberServiceError("INSUFFICIENT_PERMISSION", "OWNER 는 초대로 부여할 수 없습니다");
  }

  // 초대자 권한 확인 — OWNER 나 ADMIN 만 초대 가능
  const actor = await prisma.workspaceMember.findFirst({
    where: { id: ctx.memberId, workspaceId: ctx.workspaceId, status: "ACTIVE" },
    select: { role: true },
  });
  if (!actor || (actor.role !== "OWNER" && actor.role !== "ADMIN")) {
    throw new MemberServiceError("INSUFFICIENT_PERMISSION");
  }

  return prisma.$transaction(async (tx) => {
    // AppUser.email 은 unique 가 아니므로 findFirst 사용.
    const existingUser = await tx.appUser.findFirst({
      where: { email, status: "ACTIVE" },
      select: { id: true },
    });

    if (existingUser) {
      // 이미 회원인지 확인
      const existingMember = await tx.workspaceMember.findFirst({
        where: { workspaceId: ctx.workspaceId, userId: existingUser.id },
        select: { id: true, status: true },
      });
      if (existingMember) {
        if (existingMember.status === "ACTIVE") {
          return { memberId: existingMember.id, outcome: "ALREADY_MEMBER" as const };
        }
        // LEFT/SUSPENDED 였으면 ACTIVE 로 복원
        await tx.workspaceMember.update({
          where: { id: existingMember.id },
          data: { role: input.role, status: "ACTIVE" },
        });
        return { memberId: existingMember.id, outcome: "ACTIVATED" as const };
      }
      // AppUser 존재하지만 이 workspace 에 아직 없음 → 바로 ACTIVE
      const created = await tx.workspaceMember.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: existingUser.id,
          role: input.role,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      return { memberId: created.id, outcome: "ACTIVATED" as const };
    }

    // AppUser 없음 → placeholder AppUser + INVITED member.
    // 후속 라운드에서 email 발송 + first-login 시 매칭 로직 추가.
    const placeholderUser = await tx.appUser.create({
      data: { email },
      select: { id: true },
    });
    const created = await tx.workspaceMember.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: placeholderUser.id,
        role: input.role,
        status: "INVITED",
      },
      select: { id: true },
    });
    return { memberId: created.id, outcome: "INVITED" as const };
  });
}

// 역할 변경 — OWNER 만 가능. 마지막 OWNER 를 downgrade 하면 오류.
export async function updateMemberRole(
  ctx: MemberContext,
  memberId: string,
  newRole: WorkspaceRole,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const actor = await tx.workspaceMember.findFirst({
      where: { id: ctx.memberId, workspaceId: ctx.workspaceId, status: "ACTIVE" },
      select: { role: true },
    });
    if (!actor || actor.role !== "OWNER") {
      throw new MemberServiceError("INSUFFICIENT_PERMISSION");
    }
    const target = await tx.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: ctx.workspaceId },
      select: { id: true, role: true, status: true },
    });
    if (!target) throw new MemberServiceError("MEMBER_NOT_FOUND");

    if (target.role === "OWNER" && newRole !== "OWNER") {
      const ownerCount = await tx.workspaceMember.count({
        where: { workspaceId: ctx.workspaceId, role: "OWNER", status: "ACTIVE" },
      });
      if (ownerCount <= 1) throw new MemberServiceError("CANNOT_REMOVE_LAST_OWNER");
    }

    await tx.workspaceMember.update({
      where: { id: target.id },
      data: { role: newRole },
    });
  });
}

// 제거 — OWNER 만 가능. 마지막 OWNER 를 제거하면 오류.
export async function removeMember(ctx: MemberContext, memberId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const actor = await tx.workspaceMember.findFirst({
      where: { id: ctx.memberId, workspaceId: ctx.workspaceId, status: "ACTIVE" },
      select: { role: true },
    });
    if (!actor || actor.role !== "OWNER") {
      throw new MemberServiceError("INSUFFICIENT_PERMISSION");
    }
    const target = await tx.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: ctx.workspaceId },
      select: { id: true, role: true, status: true },
    });
    if (!target) throw new MemberServiceError("MEMBER_NOT_FOUND");
    if (target.role === "OWNER") {
      const ownerCount = await tx.workspaceMember.count({
        where: { workspaceId: ctx.workspaceId, role: "OWNER", status: "ACTIVE" },
      });
      if (ownerCount <= 1) throw new MemberServiceError("CANNOT_REMOVE_LAST_OWNER");
    }

    // Soft delete: status=LEFT + 상관 데이터 유지
    await tx.workspaceMember.update({
      where: { id: target.id },
      data: { status: "LEFT" },
    });
  });
}

export function memberErrorMessage(code: MemberServiceError["code"]): string {
  switch (code) {
    case "WORKSPACE_NOT_FOUND": return "워크스페이스를 찾을 수 없습니다.";
    case "MEMBER_NOT_FOUND": return "구성원을 찾을 수 없습니다.";
    case "MEMBER_ALREADY_EXISTS": return "이미 등록된 구성원입니다.";
    case "INSUFFICIENT_PERMISSION": return "권한이 부족합니다.";
    case "CANNOT_REMOVE_LAST_OWNER": return "마지막 OWNER 는 제거할 수 없습니다.";
    case "INVALID_EMAIL": return "이메일 형식이 올바르지 않습니다.";
    default: return "오류가 발생했습니다.";
  }
}

// ROLE_LABEL / STATUS_LABEL 은 ./labels.ts 로 이동 (client-safe).
