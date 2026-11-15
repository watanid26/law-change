import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// 공개 자료(법령 원문·개정 이력)는 색인 허용, 워크스페이스 데이터는 차단.
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/app/", // 로그인해야 볼 수 있는 워크스페이스 데이터
        "/admin/",
        "/api/",
        "/login",
        "/logout",
        "/auth/",
      ],
    },
    sitemap: base ? `${base}/sitemap.xml` : undefined,
  };
}
