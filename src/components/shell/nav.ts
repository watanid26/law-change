// 사이드바 내비게이션 정의. /app/* 과 /laws/* 가 같은 목록을 공유한다.
//
// 제2판에서는 상단 가로 nav + 드롭다운 그룹이었다. 그룹 드롭다운은 클릭을
// 한 번 더 요구해서 "지금 어디에 있는지"가 흐려졌다. 제3판은 사이드바에
// 전부 펼쳐 둔다 — 항목이 7개뿐이라 접을 이유가 없다.

import type { Icon } from "../Icon";

export type NavIcon = React.ComponentProps<typeof Icon>["name"];

export interface NavLink {
  href: string;
  label: string;
  icon: NavIcon;
  /** 하위 경로까지 활성으로 볼지. /app 처럼 짧은 경로는 exact. */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavLink[];
}

// 실측 기반 정리 (2026-08 시점):
//   관심 9 · 변경 7 · 업무 0 · 사규 3(법령 매핑 0)
// 사규는 존재 이유인 "법령↔사규 매핑"이 0건이라 최상위에서 내렸다.
// 라우트·데이터·서비스는 그대로 두므로 필요해지면 한 줄 되돌리면 복구된다.
// (/app/policies 직접 접근 유효 · 설정에서 링크로 노출)
//
// 업무는 한 번 내렸다가 되돌렸다. 사용성 테스트 2회차에서 사용자가 실제로
// 업무를 만들었는데, 다음 주에 다시 찾으려면 대시보드 위젯을 거쳐야만 해서
// "매주 반복하기 싫은 순간" 2위로 꼽혔다. 안 쓰이는 게 아니라 안 보였던 것이다.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "탐색",
    items: [
      { href: "/laws/changes", label: "최근 개정", icon: "bell" },
      { href: "/laws/industries", label: "산업별", icon: "layout-dashboard" },
      { href: "/laws", label: "법령 찾기", icon: "search", exact: true },
    ],
  },
  {
    label: "내 법령",
    items: [
      { href: "/app", label: "대시보드", icon: "home", exact: true },
      { href: "/app/inbox", label: "변경 알림", icon: "bell" },
      { href: "/app/watches", label: "관심 법령", icon: "bookmark" },
      { href: "/app/tasks", label: "업무", icon: "list-checks" },
      { href: "/app/calendar", label: "시행 일정", icon: "calendar" },
    ],
  },
  {
    label: "",
    items: [{ href: "/app/settings", label: "설정", icon: "settings" }],
  },
];

export const ALL_NAV_LINKS: NavLink[] = NAV_GROUPS.flatMap((g) => g.items);

/** 현재 경로가 링크의 활성 구간인지. */
export function isNavActive(pathname: string, link: NavLink): boolean {
  if (link.exact) return pathname === link.href;
  if (pathname === link.href) return true;
  return pathname.startsWith(link.href + "/");
}
