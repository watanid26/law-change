import type { Metadata } from "next";
import { Nanum_Myeongjo } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { siteUrl } from "@/lib/site-url";
import { ConfirmProvider } from "@/components/ui/confirm";

// 법령의 목소리. CSS @import 로 불러오면 URL 의 `wght@400;700;800` 세미콜론이
// @import 종결로 파싱돼 요청 자체가 잘린다(실측: 빌드 CSS 에서 URL 절단 확인).
// next/font 는 빌드 시점에 self-host 해서 그 문제가 없고, 외부 요청도 사라진다.
const nanumMyeongjo = Nanum_Myeongjo({
  // latin 서브셋에 숫자(U+0030-0039)가 들어 있다. 조문 번호("제101조"의 101)가
  // 여기 걸리므로 반드시 포함해야 한다 — 빠지면 번호만 폴백 고딕으로 렌더된다.
  // 한글은 next/font 가 unicode-range 로 92개 조각을 자동 생성한다.
  subsets: ["latin"],
  // 실제로 쓰는 두 굵기만. 800 은 쓰는 곳이 없는데 선언하면 서브셋 파일이
  // 92개 더 생긴다.
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-nanum-myeongjo",
  // preload:true 로 두면 latin 만 preload 될 거라 예상했는데, 실제로는 한글
  // 서브셋 92개까지 전부 <link rel=preload> 로 나간다(실측 93개). 폰트 93개를
  // eager 로 받으면 CSS·JS 와 대역폭을 다투고 first paint 가 밀린다.
  // 끄면 브라우저가 unicode-range 를 보고 실제로 필요한 2~3개만 받는다.
  preload: false,
});

// 검색 유입은 이 제품의 가장 큰 미개척 채널이다. 법령 원문은 공공데이터라
// 공개에 제약이 없고, 법무 담당자는 실제로 "OO법 개정" 으로 검색한다.
// metadataBase 가 있어야 각 페이지의 OG/canonical 이 절대 URL 로 나간다.
const SITE_URL = siteUrl();

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title: {
    default: "LawChange — 법령 변경 관리",
    // 각 페이지가 title 을 주면 "제목 · LawChange" 로 조립된다.
    template: "%s · LawChange",
  },
  description:
    "법령 변경을 조문 단위로 추적하고, 조직의 영향과 업무로 연결합니다.",
  openGraph: {
    type: "website",
    siteName: "LawChange",
    locale: "ko_KR",
  },
  // 조각 격자 마크. SVG 하나로 라이트/다크 탭 모두 대응한다.
  icons: {
    icon: [{ url: "/brand/favicon.svg", type: "image/svg+xml" }],
  },
};

// 라운드 21: FOUC 방지 — hydration 이전에 <html> class 를 확정해 다크→라이트 깜빡임 제거.
// localStorage.theme > prefers-color-scheme > light 순 우선순위.
// FOUC 방지 — hydration 이전에 <html> class 를 확정한다.
// localStorage.theme > prefers-color-scheme > light 순.
//
// 추가로 배경색을 인라인 스타일로 직접 칠한다. Tailwind 출력이 라우트별 CSS
// 청크로 쪼개져 있어서, 새 라우트의 청크가 늦게 도착하면 그 사이 본문이
// 무스타일(브라우저 기본 = 흰 배경)로 그려진다. 다크모드 사용자에게는 화면이
// 번쩍이며 깨진 것처럼 보인다(산업별 페이지 진입에서 실제로 관찰됨).
// 인라인 스타일은 청크 로딩과 무관하게 최초 페인트부터 적용된다.
const THEME_INIT_SCRIPT = `
(function(){try{
  var s = localStorage.getItem('theme');
  var d = s === 'dark' || (!s && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var el = document.documentElement;
  if (d) el.classList.add('dark');
  el.style.colorScheme = d ? 'dark' : 'light';
  el.style.backgroundColor = d ? '#111316' : '#F7F7F0';
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={nanumMyeongjo.variable} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="antialiased bg-canvas text-fg">
        {/* 확인 다이얼로그는 앱 전역에서 쓰이므로 루트에 한 번만 둔다. */}
        <ConfirmProvider>{children}</ConfirmProvider>
      </body>
    </html>
  );
}
