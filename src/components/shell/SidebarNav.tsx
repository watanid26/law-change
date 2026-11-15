"use client";

// 사이드바 내비게이션 본체 (활성 판정에 usePathname 이 필요해서 client).
// 데스크톱 고정 사이드바와 모바일 드로어가 같은 마크업을 공유한다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../Icon";
import { cx } from "../ui/styles";
import { isNavActive, NAV_GROUPS, type NavLink } from "./nav";

function Item({
  link,
  onNavigate,
}: {
  link: NavLink;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const active = isNavActive(pathname, link);
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      // active: olive 2px 좌측 인디케이터 + subtle olive 배경.
      // 블록 전체를 채우지 않는다 (C안 §17 "전체 indigo fill 금지"와 같은 취지).
      className={cx(
        "flex h-9 items-center gap-2.5 rounded-sm border-l-2 pl-2 pr-2.5 text-base transition-colors duration-swift",
        active
          ? "border-l-primary bg-selected font-medium text-primary-text"
          : "border-l-transparent text-fg-secondary hover:bg-hover hover:text-fg",
      )}
    >
      <Icon
        name={link.icon}
        size={17}
        className={cx("shrink-0", active ? "text-primary-text" : "text-fg-muted")}
      />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5" aria-label="주 메뉴">
      {NAV_GROUPS.map((group, i) => (
        <div key={group.label || `group-${i}`}>
          {group.label ? (
            <p className="mb-1 px-2.5 text-xs font-medium text-fg-muted">
              {group.label}
            </p>
          ) : null}
          <div className="flex flex-col gap-0.5">
            {group.items.map((link) => (
              <Item key={link.href} link={link} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
