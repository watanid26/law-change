import { NextResponse } from "next/server";
import {
  runCollectorMaintenance,
  runMonthlyReconciliation,
  runWeeklyIntegrityCheck,
} from "@/lib/collector/orchestrator";
import { requireCronAuth } from "@/lib/security/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// mode:
// - maintenance (기본): stale 복구 + DONE 정리
// - weekly: 문서별 최신 sourceVersionId 재확인 (200개 표본)
// - monthly: 법제처 전체 sourceId 스캔 (cursor 기반, 여러 실행)
//   sourceType 파라미터 없으면 LAW, ADMIN_RULE 순차 실행 (각각 독립 try/catch)
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "maintenance";

  try {
    if (mode === "weekly") {
      const report = await runWeeklyIntegrityCheck({ sampleLimit: 200 });
      return NextResponse.json({ ok: true, mode, report });
    }
    if (mode === "monthly") {
      const requested = url.searchParams.get("sourceType") as "LAW" | "ADMIN_RULE" | null;
      if (requested) {
        const report = await runMonthlyReconciliation({ sourceType: requested });
        return NextResponse.json({ ok: true, mode, sourceType: requested, report });
      }
      // 명시 없으면 두 소스 모두 독립 실행
      const results: Record<string, unknown> = {};
      for (const st of ["LAW", "ADMIN_RULE"] as const) {
        try {
          results[st] = await runMonthlyReconciliation({ sourceType: st });
        } catch (err) {
          results[st] = { error: err instanceof Error ? err.message : String(err) };
        }
      }
      return NextResponse.json({ ok: true, mode, results });
    }
    const report = await runCollectorMaintenance();
    return NextResponse.json({ ok: true, mode, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, mode, error: message }, { status: 500 });
  }
}
