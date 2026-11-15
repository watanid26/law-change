import Link from "next/link";
import { tryGetUserContext } from "@/lib/auth/session";
import { Icon } from "./Icon";
import { LogoutButton } from "@/app/app/LogoutButton";

interface NavItem {
  id: string;
  label: string;
  icon: "home" | "bell" | "star" | "clock" | "archive";
  href?: string;
  authOnly?: boolean;
  publicOnly?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

const publicNav: NavItem[] = [
  { id: "home", label: "홈", icon: "home", href: "/" },
  { id: "laws", label: "전체 법령", icon: "archive", href: "/laws" },
  { id: "alerts", label: "변경 알림", icon: "bell", disabled: true, disabledReason: "로그인 후 사용 가능" },
  { id: "watch", label: "관심 목록", icon: "star", disabled: true, disabledReason: "로그인 후 사용 가능" },
];

const authNav: NavItem[] = [
  { id: "dashboard", label: "대시보드", icon: "home", href: "/app" },
  { id: "laws", label: "전체 법령", icon: "archive", href: "/laws" },
  { id: "inbox", label: "변경 알림", icon: "bell", href: "/app/inbox" },
  { id: "watches", label: "관심 법령", icon: "star", href: "/app/watches" },
  { id: "tasks", label: "업무", icon: "clock", href: "/app/tasks" },
];

// 서버 컴포넌트 — auth 상태에 따라 로그인 유도 또는 사용자 정보 표시.
// /laws 등 공개 페이지에서도 로그인 사용자에겐 인증 사이드바를 보여준다.
export async function Sidebar() {
  const ctx = await tryGetUserContext();
  const isAuthed = !!ctx;
  const nav = isAuthed ? authNav : publicNav;
  const userLabel = ctx?.displayName ?? ctx?.email ?? "";

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-line bg-surface h-screen sticky top-0">
      <div className="border-b border-line px-6 pt-8 pb-6">
        <Link href={isAuthed ? "/app" : "/"} className="flex items-baseline gap-2.5">
          <span className="text-xl font-semibold tracking-title text-fg">LawChange</span>
        </Link>
      </div>

      {!isAuthed && (
        <div className="px-5 pt-5 pb-4">
          <Link
            href="/login"
            className="w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-fg text-sm font-semibold py-2.5 hover:bg-primary-hover transition-colors"
          >
            <Icon name="plus" size={16} />
            로그인하고 관심 등록
          </Link>
        </div>
      )}

      {isAuthed && (
        <div className="border-b border-line px-5 pt-5 pb-4">
          <p className="text-xs text-fg-muted mb-1">현재 사용자</p>
          <p className="text-sm font-semibold text-fg truncate" title={userLabel}>{userLabel}</p>
        </div>
      )}

      <nav className="px-3 pt-4">
        <p className="mb-2 px-3 text-xs text-fg-muted">메뉴</p>
        <ul>
          {nav.map((item) => (
            <li key={item.id}>
              {item.disabled ? (
                <span
                  title={item.disabledReason}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-fg-disabled cursor-not-allowed"
                >
                  <Icon name={item.icon} size={16} className="text-fg-disabled" />
                  <span className="flex-1">{item.label}</span>
                </span>
              ) : (
                <Link
                  href={item.href ?? "#"}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-fg hover:bg-hover transition-colors"
                >
                  <Icon name={item.icon} size={16} className="text-fg-secondary" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {!isAuthed && (
        <div className="mt-6 px-5">
          <p className="mb-2 text-xs text-fg-muted">내 폴더</p>
          <div className="rounded-md bg-subtle px-3 py-3 text-xs text-fg-secondary">
            로그인 후 폴더를 만들 수 있습니다.
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-line px-5 py-5">
        {isAuthed ? (
          <LogoutButton />
        ) : (
          <Link
            href="/login"
            className="w-full inline-flex items-center justify-center gap-2 border border-line-strong bg-surface text-sm font-semibold text-fg hover:bg-hover transition-colors py-2"
          >
            로그인
          </Link>
        )}
      </div>
    </aside>
  );
}
