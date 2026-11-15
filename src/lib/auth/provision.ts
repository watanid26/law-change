// Supabase Auth 사용자를 LawCheck domain 컨텍스트로 프로비저닝.
//
// 원칙 (Round 5.1.2 최종):
// 1. AuthIdentity 는 항상 (provider="SUPABASE", providerSubject=supabase.user.id).
//    Supabase 를 auth broker 로 취급 — Google/Apple/Magic Link 등은 Supabase 안에서
//    identity 링크로 관리. LawCheck 는 provider 별 subject semantics 를 직접 관리하지 않음.
// 2. 이메일 기반 자동 AppUser merge 는 하지 않는다 (계정 탈취 방지).
//    같은 이메일이라도 별개 Supabase user → 별개 AppUser.
// 3. 기본 workspace = 항상 PERSONAL. TEAM membership 이 이미 있어도 Personal 은 별도 생성.
// 4. Soft-deleted (status=DELETED) AppUser 는 재로그인 시 자동 재활성화 금지 →
//    AuthProvisioningError("ACCOUNT_DELETED") 로 명시적 실패, 관리자 개입 요구.
// 5. Concurrency (primary): 사용자별 PostgreSQL transaction-scoped advisory lock.
//    같은 providerSubject 에 대해 동시 provisioning 이 들어와도 transaction 안에서
//    직렬화되어 Personal Workspace/OWNER member 중복 생성 원천 차단.
//    Lock 은 COMMIT/ROLLBACK 시 자동 해제 → pgbouncer transaction 모드 안전.
// 6. Concurrency (secondary defense): AuthIdentity(provider, providerSubject) UNIQUE
//    + P2002 retry (최대 1회). Advisory lock 이 취해지지 않는 극단적 상황 대비 안전망.

import type { User } from "@supabase/supabase-js";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface ProvisionedContext {
  appUserId: string;
  workspaceId: string;   // 기본 PERSONAL workspace
  memberId: string;      // 기본 workspace 안 사용자 OWNER member
}

export class AuthProvisioningError extends Error {
  code: "ACCOUNT_DELETED" | "PROVISIONING_FAILED";
  constructor(code: "ACCOUNT_DELETED" | "PROVISIONING_FAILED", message?: string) {
    super(message ?? code);
    this.name = "AuthProvisioningError";
    this.code = code;
  }
}

const PROVIDER_LABEL = "SUPABASE"; // Supabase 를 auth broker 로 통일

// 최대 1회 재시도. 동시 provisioning race 에서 loser 요청이 winner 데이터를 재조회.
const MAX_ATTEMPTS = 2;

export async function ensureAppUserFromSupabase(supaUser: User): Promise<ProvisionedContext> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await provisionOnce(supaUser);
    } catch (err) {
      lastErr = err;
      if (err instanceof AuthProvisioningError) throw err;
      if (!isUniqueViolation(err)) throw err;
      // race: 다른 요청이 방금 만들었음 → 다시 조회하면 identity 존재
      continue;
    }
  }
  throw new AuthProvisioningError("PROVISIONING_FAILED", String(lastErr));
}

async function provisionOnce(supaUser: User): Promise<ProvisionedContext> {
  const providerSubject = supaUser.id;
  const email = supaUser.email ?? null;
  const displayName = deriveDisplayName(supaUser, email);

  return prisma.$transaction(async (tx) => {
    // 0) 사용자별 transaction-scoped advisory lock.
    //    같은 providerSubject 에 대한 provisioning/repair 전체를 직렬화.
    //    hashtextextended(text, seed) 는 bigint 반환 — PG advisory lock key 로 안전.
    //    COMMIT/ROLLBACK 시 자동 해제 (session lock 아님 → pgbouncer 호환).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`lawcheck:auth:${providerSubject}`}, 0))`;

    // 1) AuthIdentity 로 exact match — 있으면 재사용 (이메일 merge 안 함)
    const existingIdentity = await tx.authIdentity.findUnique({
      where: {
        provider_providerSubject: { provider: PROVIDER_LABEL, providerSubject },
      },
      include: { user: { select: { id: true, status: true } } },
    });

    if (existingIdentity) {
      // 정책 §4: soft-deleted 재로그인 차단
      if (existingIdentity.user.status === "DELETED") {
        throw new AuthProvisioningError("ACCOUNT_DELETED");
      }
      await tx.authIdentity.update({
        where: { id: existingIdentity.id },
        data: { lastLoginAt: new Date(), email: email ?? existingIdentity.email },
      });
      const personal = await ensurePersonalWorkspace(tx, existingIdentity.user.id, displayName);
      return { appUserId: existingIdentity.user.id, workspaceId: personal.workspaceId, memberId: personal.memberId };
    }

    // 2) 신규 AppUser + AuthIdentity — 이메일 merge 없이 항상 새로 생성.
    //    같은 이메일이라도 다른 Supabase user 면 다른 AppUser.
    const newUser = await tx.appUser.create({
      data: { email, displayName, status: "ACTIVE" },
    });
    await tx.authIdentity.create({
      data: {
        userId: newUser.id,
        provider: PROVIDER_LABEL,
        providerSubject,
        email,
        lastLoginAt: new Date(),
      },
    });
    const personal = await ensurePersonalWorkspace(tx, newUser.id, displayName);
    return { appUserId: newUser.id, workspaceId: personal.workspaceId, memberId: personal.memberId };
  });
}

// Personal Workspace + OWNER member 를 명시적으로 보장.
// - 존재하면 반환
// - 없으면 생성 (TEAM membership 유무와 독립)
async function ensurePersonalWorkspace(
  tx: Prisma.TransactionClient,
  appUserId: string,
  displayName: string | null,
): Promise<{ workspaceId: string; memberId: string }> {
  const existingMember = await tx.workspaceMember.findFirst({
    where: {
      userId: appUserId,
      status: "ACTIVE",
      workspace: { type: "PERSONAL", status: "ACTIVE" },
    },
    select: { id: true, workspaceId: true },
  });
  if (existingMember) {
    return { workspaceId: existingMember.workspaceId, memberId: existingMember.id };
  }

  const ws = await tx.workspace.create({
    data: { type: "PERSONAL", name: displayName ? `${displayName}의 공간` : "내 공간" },
  });
  const member = await tx.workspaceMember.create({
    data: { workspaceId: ws.id, userId: appUserId, role: "OWNER", status: "ACTIVE" },
  });
  return { workspaceId: ws.id, memberId: member.id };
}

function deriveDisplayName(supaUser: User, email: string | null): string | null {
  return (
    (supaUser.user_metadata?.full_name as string | undefined) ??
    (supaUser.user_metadata?.name as string | undefined) ??
    email?.split("@")[0] ??
    null
  );
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
