// Integration test: Auth 프로비저닝 정책 (Round 5.1.1)
//
// 시나리오:
//   Case 1: 최초 로그인 → AppUser=1, AuthIdentity=1, Personal WS=1, OWNER Member=1
//   Case 2: 동일 user 재로그인 → 신규 생성 없음, 동일 context 반환
//   Case 3: TEAM membership 만 존재 → Personal 여전히 자동 생성, 기본 context=Personal
//   Case 4: Personal + Team 병존 → 기본 context=Personal
//   Case 5: Concurrent provisioning → 각 리소스 exactly 1, 두 요청 모두 동일 context
//   Case 6: Soft-deleted AppUser 재로그인 → AuthProvisioningError("ACCOUNT_DELETED")
//   Case 7: 이메일 same but Supabase user 다름 → 별개 AppUser (자동 merge 금지)

import { afterAll, afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { ensureAppUserFromSupabase, AuthProvisioningError } from "@/lib/auth/provision";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_AUTH_";

function fakeSupabaseUser(overrides: Partial<{ id: string; email: string; fullName: string }> = {}): User {
  const id = overrides.id ?? `sup_${randomUUID().slice(0, 8)}`;
  const email = overrides.email ?? `${TEST_PREFIX}${id}@t.local`;
  return {
    id,
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "google" },
    user_metadata: { full_name: overrides.fullName ?? `User ${id.slice(0, 4)}` },
    created_at: new Date().toISOString(),
  } as unknown as User;
}

async function cleanup() {
  // Cascade 로 workspace → member/watch/task 등, appUser → identity 정리
  await prisma.workspace.deleteMany({ where: { name: { contains: TEST_PREFIX } } });
  // Personal WS 는 사용자 displayName 기반 이름이라 별도 정리
  const users = await prisma.appUser.findMany({
    where: { email: { startsWith: TEST_PREFIX } },
    select: { id: true, memberships: { select: { workspaceId: true } } },
  });
  const wsIds = users.flatMap((u) => u.memberships.map((m) => m.workspaceId));
  if (wsIds.length > 0) {
    await prisma.workspace.deleteMany({ where: { id: { in: wsIds } } });
  }
  await prisma.appUser.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

afterEach(async () => await cleanup());
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("Auth provisioning", () => {
  it("Case 1: 최초 로그인 → 정확히 하나씩 생성", async () => {
    const u = fakeSupabaseUser();
    const ctx = await ensureAppUserFromSupabase(u);
    expect(ctx.appUserId).toBeTruthy();
    expect(ctx.workspaceId).toBeTruthy();
    expect(ctx.memberId).toBeTruthy();

    const [appUsers, identities, wss, members] = await Promise.all([
      prisma.appUser.count({ where: { id: ctx.appUserId } }),
      prisma.authIdentity.count({ where: { userId: ctx.appUserId } }),
      prisma.workspace.count({ where: { id: ctx.workspaceId, type: "PERSONAL" } }),
      prisma.workspaceMember.count({ where: { id: ctx.memberId, role: "OWNER", status: "ACTIVE" } }),
    ]);
    expect(appUsers).toBe(1);
    expect(identities).toBe(1);
    expect(wss).toBe(1);
    expect(members).toBe(1);
  });

  it("Case 2: 동일 user 재로그인 → 신규 생성 없음", async () => {
    const u = fakeSupabaseUser();
    const first = await ensureAppUserFromSupabase(u);
    const beforeCounts = await snapshotCounts();

    const second = await ensureAppUserFromSupabase(u);
    expect(second).toEqual(first);

    const afterCounts = await snapshotCounts();
    expect(afterCounts).toEqual(beforeCounts);
  });

  it("Case 3: 기존 AuthIdentity + TEAM-only → Personal repair (진짜 TEAM-only 시나리오)", async () => {
    const u = fakeSupabaseUser();
    // 사전 fixture: AppUser + AuthIdentity + TEAM Workspace + TEAM Member (Personal 없음).
    // 이 상태는 예: migration/이전 버전 앱/수동 조작/repair 필요 시나리오.
    const appUser = await prisma.appUser.create({
      data: { email: u.email!, displayName: "TeamOnlyUser" },
    });
    await prisma.authIdentity.create({
      data: {
        userId: appUser.id,
        provider: "SUPABASE",
        providerSubject: u.id,
        email: u.email!,
      },
    });
    const teamWs = await prisma.workspace.create({
      data: { type: "TEAM", name: `${TEST_PREFIX}TeamOnly_${randomUUID().slice(0,4)}` },
    });
    const teamMember = await prisma.workspaceMember.create({
      data: { workspaceId: teamWs.id, userId: appUser.id, role: "MEMBER", status: "ACTIVE" },
    });

    // 이 상태에서 이 사용자로 로그인 → 기존 AppUser 재사용, TEAM 유지, Personal 신규 생성
    const ctx = await ensureAppUserFromSupabase(u);

    // 기존 AppUser 유지 확인
    expect(ctx.appUserId).toBe(appUser.id);

    // 기본 context 는 반드시 PERSONAL
    const returnedWs = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId } });
    expect(returnedWs?.type).toBe("PERSONAL");
    expect(returnedWs?.id).not.toBe(teamWs.id);

    // TEAM Workspace + TEAM Member 그대로 유지
    const teamWsAfter = await prisma.workspace.findUnique({ where: { id: teamWs.id } });
    expect(teamWsAfter).not.toBeNull();
    const teamMemberAfter = await prisma.workspaceMember.findUnique({ where: { id: teamMember.id } });
    expect(teamMemberAfter).not.toBeNull();
    expect(teamMemberAfter!.role).toBe("MEMBER");

    // Personal Workspace 정확히 1개 + OWNER member 1개
    const personalCount = await prisma.workspace.count({
      where: {
        type: "PERSONAL",
        members: { some: { userId: appUser.id } },
      },
    });
    expect(personalCount).toBe(1);
    const ownerCount = await prisma.workspaceMember.count({
      where: {
        userId: appUser.id,
        role: "OWNER",
        workspace: { type: "PERSONAL" },
      },
    });
    expect(ownerCount).toBe(1);
  });

  it("Case 4: Personal + TEAM 병존 → 기본 context = Personal", async () => {
    const u = fakeSupabaseUser();
    const first = await ensureAppUserFromSupabase(u); // Personal 생성

    // Team 추가
    const teamWs = await prisma.workspace.create({
      data: { type: "TEAM", name: `${TEST_PREFIX}TeamAdded_${randomUUID().slice(0,4)}` },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: teamWs.id, userId: first.appUserId, role: "MEMBER" },
    });

    const again = await ensureAppUserFromSupabase(u);
    expect(again.workspaceId).toBe(first.workspaceId); // Personal 그대로
    const ws = await prisma.workspace.findUnique({ where: { id: again.workspaceId } });
    expect(ws?.type).toBe("PERSONAL");
  });

  it("Case 5: Concurrent provisioning race → 리소스 1개, 두 요청 모두 동일 context", async () => {
    const u = fakeSupabaseUser();
    const [a, b] = await Promise.all([
      ensureAppUserFromSupabase(u),
      ensureAppUserFromSupabase(u),
    ]);
    expect(a).toEqual(b);

    const identities = await prisma.authIdentity.count({
      where: { providerSubject: u.id },
    });
    const users = await prisma.appUser.count({ where: { email: u.email! } });
    const wss = await prisma.workspace.count({ where: { id: a.workspaceId } });
    const members = await prisma.workspaceMember.count({
      where: { userId: a.appUserId, workspace: { type: "PERSONAL" } },
    });
    expect(identities).toBe(1);
    expect(users).toBe(1);
    expect(wss).toBe(1);
    expect(members).toBe(1);
  });

  it("Case 6: Soft-deleted AppUser 재로그인 → AuthProvisioningError('ACCOUNT_DELETED')", async () => {
    const u = fakeSupabaseUser();
    const first = await ensureAppUserFromSupabase(u);
    // soft-delete
    await prisma.appUser.update({
      where: { id: first.appUserId },
      data: { status: "DELETED", deletedAt: new Date() },
    });

    await expect(ensureAppUserFromSupabase(u)).rejects.toBeInstanceOf(AuthProvisioningError);
    try {
      await ensureAppUserFromSupabase(u);
    } catch (err) {
      expect((err as AuthProvisioningError).code).toBe("ACCOUNT_DELETED");
    }
  });

  it("Case 7: 이메일 같지만 Supabase user 다름 → 별개 AppUser (자동 merge 금지)", async () => {
    const email = `${TEST_PREFIX}shared_${randomUUID().slice(0,4)}@t.local`;
    const u1 = fakeSupabaseUser({ email });
    const u2 = fakeSupabaseUser({ email });
    const ctx1 = await ensureAppUserFromSupabase(u1);
    const ctx2 = await ensureAppUserFromSupabase(u2);
    expect(ctx1.appUserId).not.toBe(ctx2.appUserId);
    expect(ctx1.workspaceId).not.toBe(ctx2.workspaceId);

    const identities = await prisma.authIdentity.count({
      where: { email, provider: "SUPABASE" },
    });
    expect(identities).toBe(2);
  });

  it("Case 8: 기존 identity + TEAM-only + concurrent repair → Personal 정확히 1개", async () => {
    // 이 케이스가 Round 5.1.2 의 핵심 방어 대상.
    // fixture: AppUser + AuthIdentity + TEAM 만 존재, Personal 없음.
    // 두 concurrent request 가 동시에 Personal 을 만들려 할 때 advisory lock 이
    // 직렬화하여 정확히 1개만 생성되어야 함.
    const u = fakeSupabaseUser();
    const appUser = await prisma.appUser.create({
      data: { email: u.email!, displayName: "RepairTarget" },
    });
    await prisma.authIdentity.create({
      data: {
        userId: appUser.id,
        provider: "SUPABASE",
        providerSubject: u.id,
        email: u.email!,
      },
    });
    const teamWs = await prisma.workspace.create({
      data: { type: "TEAM", name: `${TEST_PREFIX}TeamOnlyConcurrent_${randomUUID().slice(0,4)}` },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: teamWs.id, userId: appUser.id, role: "MEMBER", status: "ACTIVE" },
    });

    const [a, b] = await Promise.all([
      ensureAppUserFromSupabase(u),
      ensureAppUserFromSupabase(u),
    ]);

    // 두 요청 모두 동일 context 반환
    expect(a).toEqual(b);
    expect(a.appUserId).toBe(appUser.id);

    // Personal Workspace 정확히 1개, OWNER member 정확히 1개
    const personalCount = await prisma.workspace.count({
      where: { type: "PERSONAL", members: { some: { userId: appUser.id } } },
    });
    expect(personalCount).toBe(1);

    const ownerCount = await prisma.workspaceMember.count({
      where: { userId: appUser.id, role: "OWNER", workspace: { type: "PERSONAL" } },
    });
    expect(ownerCount).toBe(1);

    // AppUser / AuthIdentity 중복 없음
    const appUsers = await prisma.appUser.count({ where: { id: appUser.id } });
    const identities = await prisma.authIdentity.count({ where: { providerSubject: u.id } });
    expect(appUsers).toBe(1);
    expect(identities).toBe(1);
  });
});

async function snapshotCounts() {
  const [appUsers, identities, workspaces, members] = await Promise.all([
    prisma.appUser.count({ where: { email: { startsWith: TEST_PREFIX } } }),
    prisma.authIdentity.count({ where: { email: { startsWith: TEST_PREFIX } } }),
    prisma.workspace.count({ where: { name: { contains: TEST_PREFIX } } }),
    prisma.workspaceMember.count({
      where: { user: { email: { startsWith: TEST_PREFIX } } },
    }),
  ]);
  return { appUsers, identities, workspaces, members };
}
