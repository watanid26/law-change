import type { SVGProps } from "react";

// 라운드 20: Lucide 스타일 아웃라인 아이콘 확장 (2px stroke, 24×24 viewport).
type IconName =
  | "home"
  | "bell"
  | "star"
  | "star-filled"
  | "clock"
  | "archive"
  | "folder"
  | "plus"
  | "share"
  | "download"
  | "chevron-right"
  | "chevron-down"
  | "chevron-up"
  | "arrow-right"
  | "check"
  | "edit"
  | "calendar"
  | "menu"
  | "logo"
  // R20 추가
  | "file-text"
  | "book-open"
  | "git-compare"
  | "columns"
  | "sparkles"
  | "message-square"
  | "bookmark"
  | "external-link"
  | "search"
  | "users"
  | "settings"
  | "trash"
  // 제3판 shell — 사이드바 내비게이션용. 같은 2px 아웃라인 패밀리 유지.
  | "layout-dashboard"
  | "scale"
  | "list-checks"
  | "log-out";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

const paths: Record<IconName, React.ReactNode> = {
  home: (
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H4a1 1 0 0 1-1-1z" />
  ),
  bell: (
    <path d="M6 8a6 6 0 1 1 12 0v4l1.5 3h-15L6 12zm3 9a3 3 0 0 0 6 0" />
  ),
  star: (
    <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z" />
  ),
  "star-filled": (
    <path
      d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"
      fill="currentColor"
    />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  archive: (
    <>
      <path d="M3 5h18v4H3z" />
      <path d="M5 9v10h14V9" />
      <path d="M10 13h4" />
    </>
  ),
  folder: (
    <path d="M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8 11 8-5M8 13l8 5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-up": <path d="m6 15 6-6 6 6" />,
  "arrow-right": <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 5 5L20 7" />,
  edit: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="m14 6 4 4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  logo: (
    <>
      <path
        d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
        fill="currentColor"
        fillOpacity=".15"
      />
      <path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M14 4v5h5" />
    </>
  ),
  // R20: 법령·규정 화면용 아이콘 세트 (Lucide 스타일)
  "file-text": (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8M8 17h5" />
    </>
  ),
  "book-open": (
    <>
      <path d="M12 6c-2-1.5-4.5-2-8-2v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2z" />
      <path d="M12 6v14" />
    </>
  ),
  "git-compare": (
    <>
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="M5 8.5V15a3 3 0 0 0 3 3h5" />
      <path d="M19 15.5V9a3 3 0 0 0-3-3h-5" />
      <path d="m11 3 2 3-2 3M13 15l-2 3 2 3" />
    </>
  ),
  columns: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M12 4v16" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3 13.5 9 20 10.5 13.5 12 12 18 10.5 12 4 10.5 10.5 9z" />
      <path d="M19 4v3M20.5 5.5h-3M5 17v3M6.5 18.5h-3" />
    </>
  ),
  "message-square": (
    <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
  ),
  bookmark: (
    <path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z" />
  ),
  "external-link": (
    <>
      <path d="M14 4h6v6" />
      <path d="M10 14 20 4" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.65 1.65 0 0 0-1.8-.3 1.65 1.65 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.65 1.65 0 0 0-1-1.5 1.65 1.65 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.65 1.65 0 0 0 .3-1.8 1.65 1.65 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.65 1.65 0 0 0 1.5-1 1.65 1.65 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.65 1.65 0 0 0 1.8.3H9a1.65 1.65 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.65 1.65 0 0 0-.3 1.8V9a1.65 1.65 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  "layout-dashboard": (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3v18M7 21h10" />
      <path d="M12 6 5 8m7-2 7 2" />
      <path d="M5 8 2.5 14a3 3 0 0 0 5 0z" />
      <path d="M19 8l-2.5 6a3 3 0 0 0 5 0z" />
    </>
  ),
  "list-checks": (
    <>
      <path d="M3 5.5 4.5 7 7 4" />
      <path d="M3 12.5 4.5 14 7 11" />
      <path d="M3 19.5 4.5 21 7 18" />
      <path d="M11 6h10M11 13h10M11 20h10" />
    </>
  ),
  "log-out": (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
};

export function Icon({ name, size = 20, className, ...rest }: IconProps) {
  // R33 감사 #2: Tailwind preflight 가 `svg { display: block }` 을 걸기 때문에,
  // 아이콘이 flex 가 아닌 인라인 문맥(버튼 라벨 옆, 문장 안)에 놓이면 줄 전체를
  // 차지하는 블록 박스가 되어 라벨 아래로 떨어진다.
  // inline-block + align-middle 을 기본값으로 둬서 인라인 문맥에서 정상 배치되게
  // 한다. flex 컨테이너 안에서는 display 가 어차피 blockify 되므로 영향이 없다.
  // shrink-0 은 좁은 폭에서 아이콘이 찌그러지는 것을 막는다.
  const base = "inline-block shrink-0 align-middle";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `${base} ${className}` : base}
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
