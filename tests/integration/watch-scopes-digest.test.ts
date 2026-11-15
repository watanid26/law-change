// 조문 단위 Watch 감시 + Digest 이메일 통합 테스트.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createOrReactivateWatch } from "@/lib/watches/service";
import { addWatchScope, listContentUnitsForDocument, removeWatchScope } from "@/lib/watches/scopes";
import { runInboxFanout } from "@/lib/inbox/service";
import { runDigestBatch } from "@/lib/notifications/digest";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_SD_";

interface Tenant { ws: string; member: string; documentId: string; cuIds: string[]; }

async function makeTenant(label: string, docId: string, cuIds: string[]): Promise<Tenant> {
  const suffix = `${TEST_PREFIX}${label}_${randomUUID().slice(0, 6)}`;
  const user = await prisma.appUser.create({ data: { email: `${suffix}@t.local` } });
  const ws = await prisma.workspace.create({ data: { type: "PERSONAL", name: `WS_${suffix}` } });
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
  });
  return { ws: ws.id, member: member.id, documentId: docId, cuIds };
}

async function makeEventWithDiffs(docId: string, affectedCuIds: string[]): Promise<string> {
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
      totalDiffCount: affectedCuIds.length,
    },
  });
  // 각 조문에 대한 diff 생성 (fanout scope filtering 이 diff.contentUnitId 를 봄)
  for (const cuId of affectedCuIds) {
    await prisma.legalDiff.create({
      data: {
        documentId: docId,
        changeEventId: event.id,
        contentUnitId: cuId,
        changeType: "MODIFIED",
      },
    });
  }
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
let cuIds: string[];

beforeAll(async () => {
  await cleanup();
  const doc = await prisma.legalDocument.findFirst({ select: { id: true } });
  if (!doc) throw new Error("prerequisite: LegalDocument");
  sharedDocId = doc.id;
  const cus = await listContentUnitsForDocument(sharedDocId, 5);
  if (cus.length < 2) throw new Error("prerequisite: at least 2 ContentUnits in test document");
  cuIds = cus.map((c) => c.id);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
describe("조문 단위 Watch (WatchContentScope)", () => {
  it("Case 1: scope 없는 Watch → 모든 이벤트에 Inbox 생성 (기존 동작)", async () => {
    const t = await makeTenant("A", sharedDocId, cuIds);
    const w = await createOrReactivateWatch(
      { workspaceId: t.ws, memberId: t.member },
      sharedDocId,
    );
    const eventId = await makeEventWithDiffs(sharedDocId, [cuIds[0]]);
    await runInboxFanout();
    const inbox = await prisma.changeInboxItem.findFirst({
      where: { workspaceId: t.ws, changeEventId: eventId },
    });
    expect(inbox).not.toBeNull();

    // cleanup for next case
    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.notification.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalDiff.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.workspace.delete({ where: { id: t.ws } });
  });

  it("Case 2: scope 설정된 Watch — 매칭 조문 변경 시만 Inbox 생성", async () => {
    const t = await makeTenant("B", sharedDocId, cuIds);
    const w = await createOrReactivateWatch(
      { workspaceId: t.ws, memberId: t.member },
      sharedDocId,
    );
    // cuIds[0] 만 감시
    await addWatchScope(
      { workspaceId: t.ws, memberId: t.member },
      w.watch.id,
      cuIds[0],
    );

    // 이벤트가 cuIds[1] 만 변경 → scope 미매칭 → Inbox 안 만들어짐
    const eventNotMatched = await makeEventWithDiffs(sharedDocId, [cuIds[1]]);
    await runInboxFanout();
    const inboxNotMatched = await prisma.changeInboxItem.count({
      where: { workspaceId: t.ws, changeEventId: eventNotMatched },
    });
    expect(inboxNotMatched).toBe(0);

    // 이벤트가 cuIds[0] 변경 포함 → scope 매칭 → Inbox 생성
    const eventMatched = await makeEventWithDiffs(sharedDocId, [cuIds[0], cuIds[1]]);
    await runInboxFanout();
    const inboxMatched = await prisma.changeInboxItem.count({
      where: { workspaceId: t.ws, changeEventId: eventMatched },
    });
    expect(inboxMatched).toBe(1);

    // cleanup
    for (const eid of [eventNotMatched, eventMatched]) {
      await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eid } });
      await prisma.notification.deleteMany({ where: { changeEventId: eid } });
      await prisma.legalDiff.deleteMany({ where: { changeEventId: eid } });
      await prisma.legalChangeEvent.delete({ where: { id: eid } });
    }
    await prisma.workspace.delete({ where: { id: t.ws } });
  });

  it("Case 3: scope 추가 → idempotent (같은 조문 두 번 add)", async () => {
    const t = await makeTenant("C", sharedDocId, cuIds);
    const w = await createOrReactivateWatch(
      { workspaceId: t.ws, memberId: t.member },
      sharedDocId,
    );
    const r1 = await addWatchScope(
      { workspaceId: t.ws, memberId: t.member },
      w.watch.id,
      cuIds[0],
    );
    const r2 = await addWatchScope(
      { workspaceId: t.ws, memberId: t.member },
      w.watch.id,
      cuIds[0],
    );
    expect(r1.scopeId).toBe(r2.scopeId);

    await prisma.workspace.delete({ where: { id: t.ws } });
  });

  it("Case 4: cross-workspace scope 조작 시도 → WATCH_NOT_FOUND", async () => {
    const tA = await makeTenant("D", sharedDocId, cuIds);
    const tB = await makeTenant("E", sharedDocId, cuIds);
    const w = await createOrReactivateWatch(
      { workspaceId: tA.ws, memberId: tA.member },
      sharedDocId,
    );
    await expect(
      addWatchScope(
        { workspaceId: tB.ws, memberId: tB.member },
        w.watch.id,
        cuIds[0],
      ),
    ).rejects.toMatchObject({ code: "WATCH_NOT_FOUND" });

    await prisma.workspace.deleteMany({ where: { id: { in: [tA.ws, tB.ws] } } });
  });
});

// ─────────────────────────────────────────────────────────────
describe("Notification digest", () => {
  it("Case 5: digestMode=IMMEDIATE → fanout 시 즉시 EMAIL delivery", async () => {
    const t = await makeTenant("F", sharedDocId, cuIds);
    const w = await createOrReactivateWatch(
      { workspaceId: t.ws, memberId: t.member },
      sharedDocId,
    );
    await prisma.watch.update({
      where: { id: w.watch.id },
      data: { notifyEmail: true },
    });
    // pref default = IMMEDIATE (upsert 없어도 undefined 로 취급되어 IMMEDIATE 됨)

    const eventId = await makeEventWithDiffs(sharedDocId, [cuIds[0]]);
    await runInboxFanout();

    const deliveries = await prisma.notificationDelivery.findMany({
      where: { notification: { changeEventId: eventId, recipientMemberId: t.member } },
    });
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].channel).toBe("EMAIL");
    expect(deliveries[0].status).toBe("PENDING");

    // cleanup
    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.notification.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalDiff.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.workspace.delete({ where: { id: t.ws } });
  });

  it("Case 6: digestMode=DAILY → fanout 시 EMAIL delivery 생성 X (digest job 이 처리)", async () => {
    const t = await makeTenant("G", sharedDocId, cuIds);
    const w = await createOrReactivateWatch(
      { workspaceId: t.ws, memberId: t.member },
      sharedDocId,
    );
    await prisma.watch.update({
      where: { id: w.watch.id },
      data: { notifyEmail: true },
    });
    // pref = DAILY
    await prisma.notificationPreference.upsert({
      where: { workspaceMemberId: t.member },
      create: { workspaceMemberId: t.member, digestMode: "DAILY", changeEmail: true },
      update: { digestMode: "DAILY", changeEmail: true },
    });

    const eventId = await makeEventWithDiffs(sharedDocId, [cuIds[0]]);
    await runInboxFanout();

    const deliveries = await prisma.notificationDelivery.count({
      where: { notification: { changeEventId: eventId, recipientMemberId: t.member } },
    });
    expect(deliveries).toBe(0); // digest 모드는 fanout 에서 delivery 만들지 않음

    // Notification 자체는 만들어졌어야 함 (in-app 알림)
    const notif = await prisma.notification.count({
      where: { changeEventId: eventId, recipientMemberId: t.member },
    });
    expect(notif).toBe(1);

    // digest job 실행 → DAILY 창 안 아이템 있음 → 발송 시도
    const report = await runDigestBatch();
    expect(report.sent).toBeGreaterThanOrEqual(1);

    // 발송 marker 생성 확인
    const marker = await prisma.notification.count({
      where: { recipientMemberId: t.member, kind: "DIGEST_SENT" },
    });
    expect(marker).toBe(1);

    // 두 번째 즉시 실행 → 최소 간격 미달로 스킵
    const report2 = await runDigestBatch();
    expect(report2.sent).toBe(0);
    expect(report2.skipped).toBeGreaterThanOrEqual(1);

    // cleanup
    await prisma.notification.deleteMany({ where: { recipientMemberId: t.member } });
    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalDiff.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.workspace.delete({ where: { id: t.ws } });
  });

  it("Case 7: digestMode=OFF → EMAIL delivery 안 만들고 digest 도 스킵", async () => {
    const t = await makeTenant("H", sharedDocId, cuIds);
    const w = await createOrReactivateWatch(
      { workspaceId: t.ws, memberId: t.member },
      sharedDocId,
    );
    await prisma.watch.update({
      where: { id: w.watch.id },
      data: { notifyEmail: true },
    });
    await prisma.notificationPreference.upsert({
      where: { workspaceMemberId: t.member },
      create: { workspaceMemberId: t.member, digestMode: "OFF" },
      update: { digestMode: "OFF" },
    });

    const eventId = await makeEventWithDiffs(sharedDocId, [cuIds[0]]);
    await runInboxFanout();

    const deliveries = await prisma.notificationDelivery.count({
      where: { notification: { changeEventId: eventId, recipientMemberId: t.member } },
    });
    expect(deliveries).toBe(0);

    const report = await runDigestBatch();
    // OFF 는 digest 대상 아니므로 후보에 안 잡힘
    expect(report.candidates).toBe(0);

    await prisma.notification.deleteMany({ where: { recipientMemberId: t.member } });
    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalDiff.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.workspace.delete({ where: { id: t.ws } });
  });
});
