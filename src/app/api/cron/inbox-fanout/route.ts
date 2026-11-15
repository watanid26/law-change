// Cron: LegalChangeEvent → DomainOutbox → Watch 매칭 → ChangeInboxItem fan-out.
// 두 단계 (enqueue + consume) 를 한 요청에 함께 수행.

import { NextResponse } from "next/server";
import { runInboxFanout } from "@/lib/inbox/service";
import { requireCronAuth } from "@/lib/security/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const report = await runInboxFanout();
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
