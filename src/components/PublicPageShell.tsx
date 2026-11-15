// 공개 페이지(/laws, /laws/[id], /laws/industries) 공용 shell.
//
// 제3판: /app/* 과 동일한 AppShell 을 쓴다. 로그인 사용자에게는 같은 사이드바가,
// 비로그인 사용자에게는 같은 레이아웃에 로그인 CTA 가 보인다.
// (제2판에서는 /laws 가 자체 상단 헤더를 갖고 있어 두 벌의 내비게이션이 공존했다.)

import { tryGetUserContext } from "@/lib/auth/session";
import { AppShell } from "./shell/AppShell";

export async function PublicPageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await tryGetUserContext();
  return (
    <AppShell
      user={
        ctx
          ? {
              name: ctx.displayName ?? null,
              email: ctx.email ?? null,
              workspaceName: ctx.workspaceName ?? null,
              workspaceType: ctx.workspaceType ?? null,
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
