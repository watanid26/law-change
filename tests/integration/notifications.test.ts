// Notification generation + delivery integration tests (Round 5.5b).
// RESEND_API_KEY 없으면 email transport 는 콘솔 fallback 으로 자동 성공 처리.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createOrReactivateWatch } from "@/lib/watches/service";
import { runInboxFanout } from "@/lib/inbox/service";
import { runNotificationDeliveryBatch } from "@/lib/notifications/service";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_NOTIF_";

interface Tenant { ws: string; member: string; documentId: string; }

async function makeTenant(label: string, docId: string): Promise<Tenant> {
  const suffix = `${TEST_PREFIX}${label}_${randomUUID().slice(0, 6)}`;
  const user = await prisma.appUser.create({ data: { email: `${suffix}@t.local` } });
  const ws = await prisma.workspace.create({ data: { type: "PERSONAL", name: `WS_${suffix}` } });
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
  });
  return { ws: ws.id, member: member.id, documentId: docId };
}

async function makeEvent(docId: string): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const version = await prisma.legalDocumentVersion.create({
    data: {
      documentId: docId,
      externalVersionId: `${TEST_PREFIX}v_${suffix}`,
      revisionType: "일부개정",
      contentHash: `hash_${suffix}`,
    },
  });
  const event = await prisma.legalChangeEvent.create({
    data: {
      documentId: docId,
      previousVersionId: null,
      newVersionId: version.id,
      eventType: "REVISION",
      discoveryType: "LIVE_DETECTION",
      notificationEligible: true,
      totalDiffCount: 0,
    },
  });
  return event.id;
}

async function cleanup() {
  await prisma.workspace.deleteMany({ where: { name: { startsWith: `WS_${TEST_PREFIX}` } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
  await prisma.domainOutbox.deleteMany({ where: { dedupeKey: { startsWith: "LEGAL_CHANGE_PUBLISHED:" } } });
  await prisma.legalDocumentVersion.deleteMany({
    where: { externalVersionId: { startsWith: `${TEST_PREFIX}v_` } },
  });
}

let sharedDocId: string;
let tenant: Tenant;

beforeAll(async () => {
  await cleanup();
  const doc = await prisma.legalDocument.findFirst({ select: { id: true } });
  if (!doc) throw new Error("prerequisite: LegalDocument");
  sharedDocId = doc.id;
  tenant = await makeTenant("main", sharedDocId);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("Notification pipeline", () => {
  it("Case 1: fanout → Notification 생성 + notifyEmail=true 이면 EMAIL delivery PENDING", async () => {
    // notifyEmail=true 로 Watch
    const w = await createOrReactivateWatch(
      { workspaceId: tenant.ws, memberId: tenant.member },
      sharedDocId,
    );
    await prisma.watch.update({
      where: { id: w.watch.id },
      data: { notifyOnChange: true, notifyEmail: true },
    });
    const eventId = await makeEvent(sharedDocId);
    await runInboxFanout();

    const notifs = await prisma.notification.findMany({
      where: { workspaceId: tenant.ws, changeEventId: eventId },
      include: { deliveries: true },
    });
    expect(notifs.length).toBe(1);
    expect(notifs[0].recipientMemberId).toBe(tenant.member);
    expect(notifs[0].kind).toBe("CHANGE_DETECTED");
    expect(notifs[0].deliveries.length).toBe(1);
    expect(notifs[0].deliveries[0].channel).toBe("EMAIL");
    expect(notifs[0].deliveries[0].status).toBe("PENDING");

    // cleanup
    await prisma.notification.deleteMany({ where: { changeEventId: eventId } });
    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.watch.deleteMany({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: w.watch.id } });
  });

  it("Case 2: notifyEmail=false → EMAIL delivery 생성 안 함 (Notification 은 생성됨)", async () => {
    const w = await createOrReactivateWatch(
      { workspaceId: tenant.ws, memberId: tenant.member },
      sharedDocId,
    );
    await prisma.watch.update({
      where: { id: w.watch.id },
      data: { notifyOnChange: true, notifyEmail: false },
    });
    const eventId = await makeEvent(sharedDocId);
    await runInboxFanout();

    const notif = await prisma.notification.findFirst({
      where: { workspaceId: tenant.ws, changeEventId: eventId },
      include: { deliveries: true },
    });
    expect(notif).not.toBeNull();
    expect(notif!.deliveries.length).toBe(0);

    await prisma.notification.deleteMany({ where: { changeEventId: eventId } });
    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.watch.deleteMany({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: w.watch.id } });
  });

  it("Case 3: dedupe — 같은 inbox 에서 중복 알림 생성 방지", async () => {
    const w = await createOrReactivateWatch(
      { workspaceId: tenant.ws, memberId: tenant.member },
      sharedDocId,
    );
    await prisma.watch.update({
      where: { id: w.watch.id },
      data: { notifyOnChange: true, notifyEmail: true },
    });
    const eventId = await makeEvent(sharedDocId);
    // 두 번 실행 → dedupeKey 로 중복 방지
    await runInboxFanout();
    await runInboxFanout();

    const notifCount = await prisma.notification.count({
      where: { workspaceId: tenant.ws, changeEventId: eventId },
    });
    expect(notifCount).toBe(1);

    await prisma.notification.deleteMany({ where: { changeEventId: eventId } });
    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.watch.deleteMany({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: w.watch.id } });
  });

  it("Case 4: delivery consumer 실행 → PENDING → SENT (console fallback)", async () => {
    const w = await createOrReactivateWatch(
      { workspaceId: tenant.ws, memberId: tenant.member },
      sharedDocId,
    );
    await prisma.watch.update({
      where: { id: w.watch.id },
      data: { notifyOnChange: true, notifyEmail: true },
    });
    const eventId = await makeEvent(sharedDocId);
    await runInboxFanout();

    const report = await runNotificationDeliveryBatch();
    expect(report.processed).toBeGreaterThanOrEqual(1);
    expect(report.sent).toBeGreaterThanOrEqual(1);

    const delivery = await prisma.notificationDelivery.findFirst({
      where: { notification: { changeEventId: eventId }, channel: "EMAIL" },
    });
    expect(delivery?.status).toBe("SENT");
    expect(delivery?.sentAt).not.toBeNull();
    expect(delivery?.provider).toBeDefined();

    await prisma.notification.deleteMany({ where: { changeEventId: eventId } });
    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.watch.deleteMany({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: w.watch.id } });
  });
});
