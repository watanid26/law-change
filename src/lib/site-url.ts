// 사이트 절대 주소.
//
// canonical · OG · sitemap · 캘린더 구독 URL 이 전부 절대 주소를 필요로 한다.
// 우선순위:
//   1) NEXT_PUBLIC_SITE_URL          — 커스텀 도메인. 직접 지정한 값이 항상 우선.
//   2) VERCEL_PROJECT_PRODUCTION_URL — Vercel 이 주는 "프로덕션" 주소.
//   3) VERCEL_URL                    — 배포별 주소(프리뷰 포함). 최후 수단.
//
// (2)를 (3)보다 먼저 보는 게 중요하다. VERCEL_URL 은 배포마다 달라지는
// lawcheck-abc123.vercel.app 형태라, 이걸 canonical 이나 sitemap 에 쓰면
// 배포할 때마다 다른 도메인으로 색인되고 캘린더 구독 URL 도 깨진다.

function normalize(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const withScheme = v.startsWith("http") ? v : `https://${v}`;
  return withScheme.replace(/\/+$/, "");
}

/** 절대 주소. 알 수 없으면 null (호출부가 기능을 끄거나 상대 경로로 폴백한다). */
export function siteUrl(): string | null {
  return (
    normalize(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalize(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalize(process.env.VERCEL_URL) ??
    null
  );
}
