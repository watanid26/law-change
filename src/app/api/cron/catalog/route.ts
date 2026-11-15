import { NextResponse } from "next/server";
import { runCatalogSync } from "@/lib/collector/orchestrator";
import { requireCronAuth } from "@/lib/security/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 최근 N일 변경 스캔 (신규·개정 감지) → 큐에 넣기만 함.
// 상세 처리는 /api/cron/jobs가 담당.
// slot 파라미터로 아침/저녁 분리 (스케줄만 다르고 로직은 동일).
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const slot = url.searchParams.get("slot") ?? "manual";
  const recentDays = Number(url.searchParams.get("recentDays") ?? "45");

  try {
    const report = await runCatalogSync({
      recentDays: Number.isFinite(recentDays) && recentDays > 0 ? recentDays : 45,
      includeLaw: true,
      includeAdminRule: true,
    });
    return NextResponse.json({ ok: true, slot, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, slot, error: message }, { status: 500 });
  }
}
