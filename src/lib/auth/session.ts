// 서버 사이드 세션 resolver.
// - getSupabaseUser(): Supabase Auth 사용자만 반환 (LawCheck domain 없이 빠른 확인)
// - requireUserContext(): AppUser + PERSONAL Workspace + OWNER Member 보장 (없으면 provision)
// - tryGetUserContext(): 로그인 안 됐으면 null (API/Server Action 용)
//
// 반환 workspaceId 는 항상 사용자의 Personal Workspace — Round 5.1 정책.
// TEAM Workspace 로의 전환은 명시적 API/URL (예: /app/w/{workspaceId}/...) 로 추후 도입.

import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerSupabase } from "./supabase-server";
import { ensureAppUserFromSupabase, AuthProvisioningError, type ProvisionedContext } from "./provision";
import { prisma } from "@/lib/prisma";

export interface UserContext extends ProvisionedContext {
  email: string | null;
  displayName: string | null;
  workspaceName: string;
  workspaceType: string; // PERSONAL | TEAM
}

// React cache: 같은 요청 안에서 여러 서버 컴포넌트가 getSupabaseUser 를 호출해도
// 실제 Supabase 왕복은 1회만. 라운드 6 503 완화 — 대시보드/사이드바 등이 각기
// getUser 를 호출하며 함수 예산을 잠식하던 문제를 줄인다.
export const getSupabaseUser = cache(async () => {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

// 반드시 로그인 + provisioning 완료된 컨텍스트. 없으면 /login 리다이렉트.
// - Supabase 세션 없음 → /login
// - AuthProvisioningError (계정 삭제 등) → 세션 sign out + /login?error=<code>
// React cache 로 요청당 1회만 실행 (여러 서버 컴포넌트가 호출해도 동일 결과 재사용).
export const requireUserContext = cache(_requireUserContext);
async function _requireUserContext(): Promise<UserContext> {
  const supaUser = await getSupabaseUser();
  if (!supaUser) redirect("/login");

  let ctx: ProvisionedContext;
  try {
    ctx = await ensureAppUserFromSupabase(supaUser);
  } catch (err) {
    if (err instanceof AuthProvisioningError) {
      const supabase = getServerSupabase();
      await supabase.auth.signOut();
      redirect(`/login?error=${err.code}`);
    }
    throw err;
  }

  // 라운드 19-A4: workspace.name/type 을 세션 컨텍스트에 노출 → 헤더에서 표시.
  const [profile, ws] = await Promise.all([
    prisma.appUser.findUnique({
      where: { id: ctx.appUserId },
      select: { email: true, displayName: true },
    }),
    prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { name: true, type: true },
    }),
  ]);
  return {
    ...ctx,
    email: profile?.email ?? supaUser.email ?? null,
    displayName: profile?.displayName ?? null,
    workspaceName: ws?.name ?? "내 공간",
    workspaceType: ws?.type ?? "PERSONAL",
  };
}

// API / Server Action 용 — 로그인 안 됐거나 provisioning 실패 시 null.
// 요청당 캐싱해서 여러 서버 컴포넌트가 호출해도 provision 1회만.
export const tryGetUserContext = cache(_tryGetUserContext);
async function _tryGetUserContext(): Promise<UserContext | null> {
  const supaUser = await getSupabaseUser();
  if (!supaUser) return null;
  let ctx: ProvisionedContext;
  try {
    ctx = await ensureAppUserFromSupabase(supaUser);
  } catch {
    return null;
  }
  const [profile, ws] = await Promise.all([
    prisma.appUser.findUnique({
      where: { id: ctx.appUserId },
      select: { email: true, displayName: true },
    }),
    prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { name: true, type: true },
    }),
  ]);
  return {
    ...ctx,
    email: profile?.email ?? supaUser.email ?? null,
    displayName: profile?.displayName ?? null,
    workspaceName: ws?.name ?? "내 공간",
    workspaceType: ws?.type ?? "PERSONAL",
  };
}
