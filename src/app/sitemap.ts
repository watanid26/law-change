import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { INDUSTRY_PRESETS } from "@/lib/laws/industryPresets";
import { siteUrl } from "@/lib/site-url";

// "OO법 개정" 검색으로 유입이 생기는 통로.
// 사이트맵 상한은 50,000 URL 이라 아직 한 파일로 충분하다.
export const revalidate = 86400; // 하루 한 번 재생성

// 20,000 이었는데 행정규칙까지 받으면서 문서가 그 위로 올라간다
// (법령 5,600 + 행정규칙 22,700 ≈ 28,300). 상한에 걸리면 lastSeenAt 이
// 오래된 문서부터 조용히 빠진다 — 빠진 줄도 모른다.
// 프로토콜 상한 50,000 에서 정적 항목 자리를 빼고 잡는다.
// 이보다 늘어나면 sitemap index 로 쪼개야 한다.
const MAX_LAWS = 49000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  // 사이트 주소를 모르면 절대 URL 을 만들 수 없다. 빈 사이트맵을 내는 게
  // 잘못된 도메인으로 색인되는 것보다 낫다.
  if (!base) return [];

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/laws`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/laws/changes`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/laws/industries`, changeFrequency: "monthly", priority: 0.8 },
    ...INDUSTRY_PRESETS.map((p) => ({
      url: `${base}/laws/industries/${p.key}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  // 조문도 없고 개정 이력도 없는 문서는 화면에 제목 말고 보여줄 게 없다
  // (실측 628건, 행정규칙이 늘면서 더 는다). 이런 얇은 페이지를 수천 개
  // 색인시키면 사이트 전체의 색인 품질이 깎인다. 사이트맵에서 뺀다.
  const docs = await prisma.legalDocument.findMany({
    where: {
      repealedAt: null,
      OR: [{ contentUnits: { some: {} } }, { changeEvents: { some: { totalDiffCount: { gt: 0 } } } }],
    },
    select: { externalDocumentId: true, lastSeenAt: true },
    orderBy: { lastSeenAt: "desc" },
    take: MAX_LAWS,
  });

  return [
    ...staticEntries,
    ...docs.map((d) => ({
      url: `${base}/laws/${d.externalDocumentId}`,
      lastModified: d.lastSeenAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
