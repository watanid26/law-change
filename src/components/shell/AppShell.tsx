// 애플리케이션 셸 — /app/* 과 /laws/* 가 공유한다.
//
// 제2판은 /app 은 상단 가로 nav, /laws 는 좌측 세로 사이드바로 갈라져 있어
// 로그인 사용자가 화면을 오갈 때마다 내비게이션이 바뀌었다. 제3판은 하나로 합친다.
//
// 구조
//   ┌ sidebar 240px ┬ header 60px ────────┐
//   │               ├ main (max 1440px)   │
//   └───────────────┴─────────────────────┘

import Link from "next/link";
import { DarkModeToggle } from "../DarkModeToggle";
import { BrandLockup } from "../BrandMark";
import { AppShellFrame } from "./AppShellFrame";
import { MobileNav } from "./MobileNav";
import { SidebarNav } from "./SidebarNav";
import { SidebarUser } from "./SidebarUser";

export interface ShellUser {
  name: string | null;
  email: string | null;
  workspaceName: string | null;
  workspaceType: string | null;
}

export function AppShell({
  user,
  headerRight,
  children,
}: {
  /** 비로그인(공개 /laws)이면 null. */
  user: ShellUser | null;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const userBlock = user ? <SidebarUser {...user} /> : null;

  return (
    <div className="min-h-screen bg-canvas">
      {/* 키보드 사용자용 본문 바로가기. 라우트를 옮길 때마다 포커스가 <body> 로
          돌아가서, 이게 없으면 매번 사이드바 항목 전부를 Tab 으로 지나야 한다.
          평소엔 화면 밖에 있다가 포커스를 받으면 나타난다. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-base focus:font-medium focus:text-primary-fg"
      >
        본문으로 건너뛰기
      </a>

      {/* 데스크톱 고정 사이드바 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-line bg-surface lg:flex print-hide">
        <div className="flex h-header shrink-0 items-center px-4">
          <Link href={user ? "/app" : "/"} aria-label="LawChange 홈">
            <BrandLockup />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
          <SidebarNav />
        </div>
        {userBlock ? (
          <div className="shrink-0 border-t border-line p-3">{userBlock}</div>
        ) : (
          <div className="shrink-0 border-t border-line p-3">
            <Link
              href="/login"
              className="flex h-9 items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover"
            >
              로그인
            </Link>
          </div>
        )}
      </aside>

      <div className="lg:pl-sidebar">
        <header className="sticky top-0 z-20 flex h-header items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6 lg:px-8 print-hide">
          <MobileNav footer={userBlock} />
          <Link href={user ? "/app" : "/"} className="lg:hidden" aria-label="LawChange 홈">
            <BrandLockup markSize={19} className="[&>span:last-child]:text-base" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {headerRight}
            <DarkModeToggle />
          </div>
        </header>

        <AppShellFrame>{children}</AppShellFrame>
      </div>
    </div>
  );
}
