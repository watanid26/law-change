// /app/* 공통 레이아웃 — 세션 보장 + 애플리케이션 셸.
// 미들웨어가 이미 세션을 확인하지만, 페이지에서 다시 requireUserContext() 로
// domain 컨텍스트를 확보한다.
//
// 제3판: 상단 가로 nav + 드롭다운 그룹 → 좌측 사이드바(AppShell)로 교체.
// /laws/* 도 같은 셸을 쓰므로 로그인 사용자는 화면을 오가도 내비게이션이 같다.

import { requireUserContext } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireUserContext();
  return (
    <AppShell
      user={{
        name: ctx.displayName ?? null,
        email: ctx.email ?? null,
        workspaceName: ctx.workspaceName ?? null,
        workspaceType: ctx.workspaceType ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}
