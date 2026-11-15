// Vercel Hobby 는 cron 2개 제한. 이 endpoint 하나가 전체 파이프라인을 실행:
//   1. Stale 잡 복구 (runJobBatch 앞단)
//   2. Detail 잡 배치 처리 → LegalChangeEvent 생성
//   3. Inbox fan-out (event → Watch 매칭 → ChangeInboxItem)
//   4. Notification delivery (IMMEDIATE PENDING → SENT via Resend or console)
//   5. Digest 발송 (DAILY/WEEKLY 창 만료된 멤버에게 요약 이메일)
//
// 각 단계 실패는 다음 단계를 막지 않음 — 부분 성공 리포트 반환.

import { NextResponse } from "next/server";
import { runJobBatch } from "@/lib/collector/orchestrator";
import { runInboxFanout } from "@/lib/inbox/service";
import { runNotificationDeliveryBatch } from "@/lib/notifications/service";
import { runDigestBatch } from "@/lib/notifications/digest";
import { requireCronAuth } from "@/lib/security/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const started = Date.now();
  const stages: Record<string, unknown> = {};

  // 1 + 2) 잡 배치 (stale 복구 + detail 처리)
  try {
    const batchSize = Number(process.env.COLLECTOR_BATCH_SIZE ?? "15");
    stages.jobs = await runJobBatch({
      batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 15,
      workerLabel: "cron-pipeline",
    });
  } catch (err) {
    stages.jobs = { ok: false, error: (err as Error).message?.slice(0, 500) };
  }

  // 3) 새로 만들어진 이벤트를 Inbox 로 fan-out
  try {
    stages.inboxFanout = await runInboxFanout();
  } catch (err) {
    stages.inboxFanout = { ok: false, error: (err as Error).message?.slice(0, 500) };
  }

  // 4) 대기 중 이메일 delivery 처리 (IMMEDIATE 모드)
  try {
    stages.notifications = await runNotificationDeliveryBatch();
  } catch (err) {
    stages.notifications = { ok: false, error: (err as Error).message?.slice(0, 500) };
  }

  // 5) Digest (DAILY/WEEKLY) 발송
  try {
    stages.digest = await runDigestBatch();
  } catch (err) {
    stages.digest = { ok: false, error: (err as Error).message?.slice(0, 500) };
  }

  return NextResponse.json({
    ok: true,
    elapsedMs: Date.now() - started,
    stages,
  });
}
