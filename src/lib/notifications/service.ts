// Notification + NotificationDelivery 서비스.
//
// 사용 흐름:
//   1. Inbox fanout 시 각 ChangeInboxItem 생성 → generateInboxNotifications(workspaceId, inboxItemId)
//      → NotificationPreference 를 참고하여 in-app / email delivery 인큐.
//   2. Cron /api/cron/notifications → runNotificationDeliveryBatch()
//      → PENDING deliveries claim → 이메일 발송 → SENT/FAILED.
//
// 원칙:
//   - dedupeKey 로 같은 이벤트에 대한 중복 알림 방지.
//   - RESEND_API_KEY 없으면 콘솔 로그로 fallback (dev-safe).
//   - Watch.notifyEmail=false 인 멤버는 email delivery 생성 안 함.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "./email-transport";

const DELIVERY_BATCH_LIMIT = Number(process.env.NOTIF_DELIVERY_BATCH ?? "50");
const RETRY_BACKOFF_MS = 15 * 60_000;
/**
 * 발송 경로가 없어 보류한 건을 다시 들여다보는 간격.
 * 재시도 한도를 태우지 않으므로 자주 볼 이유가 없다 — 설정이 붙으면
 * 그다음 크론에서 밀린 것부터 나간다.
 */
const HELD_RECHECK_MS = 60 * 60_000;

// ─────────────────────────────────────────────────────────────
// 알림 생성 — Inbox fan-out 직후 호출.
// ─────────────────────────────────────────────────────────────
export async function generateInboxNotifications(inboxItemId: string): Promise<{ created: number }> {
  const inbox = await prisma.changeInboxItem.findUnique({
    where: { id: inboxItemId },
    select: {
      id: true,
      workspaceId: true,
      changeEventId: true,
      watch: { select: { notifyOnChange: true, notifyEmail: true } },
      changeEvent: {
        select: {
          document: { select: { currentTitle: true } },
          eventType: true,
        },
      },
    },
  });
  if (!inbox || !inbox.watch) return { created: 0 };
  if (!inbox.watch.notifyOnChange) return { created: 0 };

  // 이 Workspace 의 ACTIVE 멤버 전원에게 발송 (개인 사용 = 본인 1명).
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: inbox.workspaceId, status: "ACTIVE" },
    select: { id: true, notificationPref: true },
  });

  let created = 0;
  for (const m of members) {
    const dedupeKey = `INBOX_${inbox.id}_MEMBER_${m.id}`;
    try {
      const notif = await prisma.notification.create({
        data: {
          workspaceId: inbox.workspaceId,
          recipientMemberId: m.id,
          kind: "CHANGE_DETECTED",
          changeEventId: inbox.changeEventId,
          inboxItemId: inbox.id,
          title: `[개정 감지] ${inbox.changeEvent.document.currentTitle}`,
          body: `${inbox.changeEvent.eventType} 개정이 감지되었습니다.`,
          dedupeKey,
        },
        select: { id: true },
      });
      created += 1;

      // Delivery 계획:
      // - 이메일 원함 (Watch + Member pref 둘 다 허용) AND digestMode=IMMEDIATE → 즉시 delivery
      // - DAILY/WEEKLY → delivery 안 만듦. digest job 이 별도로 취합 발송.
      // - OFF or 원치 않음 → delivery 없음.
      const pref = m.notificationPref;
      const wantsEmail = inbox.watch.notifyEmail && (pref?.changeEmail !== false);
      const digestMode = pref?.digestMode ?? "IMMEDIATE";
      if (wantsEmail && digestMode === "IMMEDIATE") {
        await prisma.notificationDelivery.create({
          data: { notificationId: notif.id, channel: "EMAIL", status: "PENDING", nextAttemptAt: new Date() },
        });
      }
    } catch (err) {
      // dedupe 충돌은 무시 (재실행 안전). 그 외는 재기)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  return { created };
}

// ─────────────────────────────────────────────────────────────
// Delivery consumer — cron 이 주기적으로 호출.
// ─────────────────────────────────────────────────────────────
export interface DeliveryBatchReport {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  elapsedMs: number;
}

export async function runNotificationDeliveryBatch(): Promise<DeliveryBatchReport> {
  const started = Date.now();
  const now = new Date();

  // Claim PENDING/FAILED (재시도 시각 지난 것) — FOR UPDATE SKIP LOCKED
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM notification_delivery
       WHERE status IN ('PENDING', 'FAILED')
         AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
         AND attempt_count < 5
       ORDER BY next_attempt_at ASC NULLS FIRST
       LIMIT ${DELIVERY_BATCH_LIMIT}
       FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    await tx.notificationDelivery.updateMany({
      where: { id: { in: ids } },
      data: { status: "PROCESSING", attemptCount: { increment: 1 } },
    });
    return ids;
  });

  let sent = 0, failed = 0, skipped = 0;
  for (const dId of claimed) {
    const delivery = await prisma.notificationDelivery.findUnique({
      where: { id: dId },
      include: {
        notification: {
          select: {
            title: true,
            body: true,
            recipient: { select: { user: { select: { email: true, displayName: true } } } },
          },
        },
      },
    });
    if (!delivery) { skipped += 1; continue; }

    if (delivery.channel !== "EMAIL") {
      // 이메일이 유일한 채널이다. 다른 채널의 delivery 가 생겼다면 그건
      // 만들어진 쪽의 버그이므로, 예전처럼 SENT 로 마킹해 조용히 삼키지 않고
      // FAILED 로 남겨 원인을 추적할 수 있게 한다.
      await prisma.notificationDelivery.update({
        where: { id: dId },
        data: {
          status: "FAILED",
          lastError: `지원하지 않는 채널: ${delivery.channel} (이메일만 지원)`,
        },
      });
      failed += 1;
      continue;
    }

    const email = delivery.notification.recipient?.user.email;
    if (!email) {
      await prisma.notificationDelivery.update({
        where: { id: dId },
        data: { status: "FAILED", lastError: "recipient email missing", nextAttemptAt: null },
      });
      failed += 1;
      continue;
    }

    const result = await sendEmail({
      to: email,
      subject: delivery.notification.title,
      html: buildInboxHtml(delivery.notification.title, delivery.notification.body),
      text: `${delivery.notification.title}\n\n${delivery.notification.body}`,
    });

    if (result.held) {
      // 발송 경로 자체가 없다. 실패로 세면 재시도 한도를 태우고 결국
      // 버려진다. 설정이 붙을 때까지 PENDING 으로 남겨둔다.
      await prisma.notificationDelivery.update({
        where: { id: dId },
        data: {
          status: "PENDING",
          lastError: result.error?.slice(0, 500),
          nextAttemptAt: new Date(Date.now() + HELD_RECHECK_MS),
        },
      });
      skipped += 1;
      continue;
    }

    if (result.ok) {
      await prisma.notificationDelivery.update({
        where: { id: dId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          provider: result.provider,
          providerMessageId: result.providerMessageId ?? null,
          lastError: null,
          nextAttemptAt: null,
        },
      });
      sent += 1;
    } else {
      await prisma.notificationDelivery.update({
        where: { id: dId },
        data: {
          status: "FAILED",
          provider: result.provider,
          lastError: result.error?.slice(0, 500),
          nextAttemptAt: new Date(Date.now() + RETRY_BACKOFF_MS),
        },
      });
      failed += 1;
    }
  }

  return {
    processed: claimed.length,
    sent,
    failed,
    skipped,
    elapsedMs: Date.now() - started,
  };
}

function buildInboxHtml(title: string, body: string): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 12px;color:#111">${escape(title)}</h2>
    <p style="color:#444;line-height:1.6">${escape(body)}</p>
    <p style="margin-top:24px;color:#888;font-size:12px">LawCheck · 변경 알림에서 상세 검토하세요.</p>
  </div>`;
}
