// 라운드 18 T5: 검색 자동완성 API. 심사평 "자동완성 기능이 이번 조사에서 확인되지 않음" 대응.
// 최상위 8개만 반환해 라운드 트립 경량화. listLaws 재사용으로 검색 조건 로직 통일.

import { NextResponse } from "next/server";
import { listLaws } from "@/lib/queries/lawList";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ items: [] });
  }
  const { rows } = await listLaws({ search: q, page: 1, pageSize: 8 });
  const items = rows.map((r) => ({
    sourceId: r.sourceId,
    title: r.title,
    documentType: r.documentType,
    ministry: r.ministry,
  }));
  return NextResponse.json({ items });
}
