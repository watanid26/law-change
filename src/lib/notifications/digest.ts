// Digest 이메일 발송기.
//
// 동작:
// - 각 ACTIVE 멤버에 대해 NotificationPreference.digestMode 확인:
//   · DAILY: 마지막 digest 발송 후 20시간+ 경과 시 발송 (24h 창)
//   · WEEKLY: 마지막 digest 발송 후 6일+ 경과 시 발송 (7d 창)
//   · IMMEDIATE / OFF: 스킵 (IMMEDIATE 는 fanout 시점에 이미 delivery 됨)
// - Digest 내용: 창 안의 CHANGE_DETECTED Notification 을 취합.
// - 마지막 발송 기록: kind="DIGEST_SENT" Notification row 로 표시 (별도 컬럼 X).
//
// Cron pipeline 안에서 runDigestBatch() 로 매번 호출됨.

import { prisma } from "@/lib/prisma";
import { sendEmail } from "./email-transport";

const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEEKLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;
const WEEKLY_MIN_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;

export interface DigestBatchReport {
  candidates: number;    // 검사한 멤버 수
  sent: number;
  skipped: number;       // 창 안 아이템 없어서 스킵
  failed: number;
  elapsedMs: number;
}

export async function runDigestBatch(): Promise<DigestBatchReport> {
  const started = Date.now();
  const now = new Date();

  const prefs = await prisma.notificationPreference.findMany({
    where: { digestMode: { in: ["DAILY", "WEEKLY"] } },
    include: {
      member: {
        include: {
          user: { select: { email: true, displayName: true } },
        },
      },
    },
  });

  let sent = 0, skipped = 0, failed = 0;

  for (const pref of prefs) {
    if (pref.member.status !== "ACTIVE") { skipped += 1; continue; }
    const email = pref.member.user.email;
    if (!email) { skipped += 1; continue; }
    if (!pref.changeEmail) { skipped += 1; continue; }

    const isDaily = pref.digestMode === "DAILY";
    const windowMs = isDaily ? DAILY_WINDOW_MS : WEEKLY_WINDOW_MS;
    const minIntervalMs = isDaily ? DAILY_MIN_INTERVAL_MS : WEEKLY_MIN_INTERVAL_MS;

    // 마지막 digest 발송 시각 확인
    const lastDigest = await prisma.notification.findFirst({
      where: {
        recipientMemberId: pref.member.id,
        kind: "DIGEST_SENT",
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (lastDigest && now.getTime() - lastDigest.createdAt.getTime() < minIntervalMs) {
      skipped += 1;
      continue;
    }

    // 창 안의 CHANGE_DETECTED 아이템 취합
    const windowStart = new Date(now.getTime() - windowMs);
    const items = await prisma.notification.findMany({
      where: {
        recipientMemberId: pref.member.id,
        kind: "CHANGE_DETECTED",
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { title: true, body: true, inboxItemId: true, createdAt: true },
    });

    if (items.length === 0) { skipped += 1; continue; }

    const subject = isDaily
      ? `[일간 요약] 관심 법령 개정 ${items.length}건`
      : `[주간 요약] 관심 법령 개정 ${items.length}건`;

    const result = await sendEmail({
      to: email,
      subject,
      html: buildDigestHtml(pref.member.user.displayName ?? "회원", isDaily, items),
      text: buildDigestText(isDaily, items),
    });

    if (result.ok) {
      // Marker 로 DIGEST_SENT Notification 생성
      await prisma.notification.create({
        data: {
          workspaceId: pref.member.workspaceId,
          recipientMemberId: pref.member.id,
          kind: "DIGEST_SENT",
          title: subject,
          body: `${items.length}건 요약 발송 완료`,
          dedupeKey: `DIGEST_${pref.member.id}_${now.toISOString()}`,
          readAt: new Date(), // 자기용 marker 이므로 읽음 처리
        },
      });
      sent += 1;
    } else {
      failed += 1;
      console.error("[digest] send failed:", { memberId: pref.member.id, error: result.error });
    }
  }

  return {
    candidates: prefs.length,
    sent,
    skipped,
    failed,
    elapsedMs: Date.now() - started,
  };
}

function buildDigestHtml(
  name: string,
  isDaily: boolean,
  items: Array<{ title: string; body: string; inboxItemId: string | null; createdAt: Date }>,
): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);

  const rows = items.map((i) => {
    const date = i.createdAt.toISOString().slice(0, 10);
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;font-size:12px;white-space:nowrap">
          ${date}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#111;font-size:14px">
          ${escape(i.title)}
        </td>
      </tr>`;
  }).join("");

  return `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f9fafb">
      <div style="background:white;padding:24px;border-radius:12px">
        <h2 style="margin:0 0 8px;color:#111;font-size:18px">
          ${escape(name)} 님, ${isDaily ? "오늘" : "이번 주"} 감지된 개정 요약
        </h2>
        <p style="color:#666;font-size:14px;margin:0 0 16px">
          관심 등록한 법령의 개정 ${items.length}건이 확인되었습니다.
        </p>
        <table style="width:100%;border-collapse:collapse">
          ${rows}
        </table>
        <p style="margin-top:24px;color:#888;font-size:12px">
          자세한 검토는 LawCheck 앱의 변경 내역 페이지에서 확인해주세요.
        </p>
      </div>
    </div>`;
}

function buildDigestText(
  isDaily: boolean,
  items: Array<{ title: string; createdAt: Date }>,
): string {
  const header = isDaily ? "오늘 감지된 개정" : "이번 주 감지된 개정";
  const lines = items.map((i) =>
    `- ${i.createdAt.toISOString().slice(0, 10)} · ${i.title}`
  );
  return `${header} ${items.length}건\n\n${lines.join("\n")}\n\nLawCheck 앱에서 상세 검토`;
}
