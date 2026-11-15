// 없는 경로로 들어왔을 때.
//
// 지금까지는 Next.js 기본 화면("404 This page could not be found.")이 그대로
// 떴다. 로그인해서 쓰던 중에 갑자기 로고도 사이드바도 없는 검은 글씨 한 줄을
// 마주치면 "서비스가 죽었나" 로 읽힌다. 브랜드와 돌아갈 길을 둔다.
//
// 앱 라우터에서 매칭되지 않는 URL 은 세그먼트 레이아웃을 타지 않고 이 파일만
// 렌더된다. 그래서 사이드바 대신 가운데 정렬로 짓고, 갈 수 있는 곳을 직접 건다.

import Link from "next/link";
import { BrandLockup } from "@/components/BrandMark";
import { ButtonLink } from "@/components/ui";

export const metadata = {
  title: "찾을 수 없는 페이지",
};

const LINKS = [
  { href: "/laws/changes", label: "최근 개정", desc: "무엇이 언제 바뀌었는지" },
  { href: "/laws", label: "법령 찾기", desc: "법령명·소관부처로 검색" },
  { href: "/app", label: "대시보드", desc: "확인이 필요한 변경과 일정" },
];

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-16">
      <Link href="/" className="rounded-md">
        <BrandLockup />
      </Link>

      <p className="mt-10 text-sm font-medium tabular text-fg-muted">404</p>
      <h1 className="mt-2 text-center text-3xl font-semibold tracking-title text-fg">
        찾을 수 없는 페이지입니다
      </h1>
      <p className="mt-3 max-w-md text-center text-base text-fg-secondary">
        주소가 바뀌었거나 삭제된 문서일 수 있습니다. 아래에서 이어서 하세요.
      </p>

      <ul className="mt-8 w-full max-w-md divide-y divide-line rounded-md border border-line bg-surface">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex items-baseline justify-between gap-4 px-4 py-3.5 transition-colors duration-swift hover:bg-hover"
            >
              <span className="text-base font-medium text-fg">{l.label}</span>
              <span className="text-sm text-fg-muted">{l.desc}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <ButtonLink href="/" variant="secondary">
          처음 화면으로
        </ButtonLink>
      </div>
    </main>
  );
}
