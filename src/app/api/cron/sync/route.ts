import { NextResponse } from "next/server";
import { runIncrementalSync } from "@/lib/collector/incremental";
import { requireCronAuth } from "@/lib/security/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 매일 아침 증분 수집. 법령·행정규칙·해석례·개인정보위/공정위 결정문을
// 한 배치로 돈다. 소스별로 독립이라 하나가 실패해도 나머지는 진행한다.
//
// 함수 상한(300초) 안에서 끝내려고 240초를 예산으로 준다. 남은 일은
// truncated 로 표시하고 다음 배치가 이어서 한다.
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const budgetMs = Number(url.searchParams.get("budgetMs") ?? "240000");

  try {
    const report = await runIncrementalSync({
      budgetMs: Number.isFinite(budgetMs) && budgetMs > 10_000 ? budgetMs : 240_000,
    });
    const failed = report.results.filter((r) => r.error).length;
    return NextResponse.json({ ok: failed === 0, report }, { status: failed > 0 ? 207 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
