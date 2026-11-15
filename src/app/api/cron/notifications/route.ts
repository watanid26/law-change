import { NextResponse } from "next/server";
import { runNotificationDeliveryBatch } from "@/lib/notifications/service";
import { requireCronAuth } from "@/lib/security/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const report = await runNotificationDeliveryBatch();
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
