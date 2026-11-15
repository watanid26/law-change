// Inbox fan-out + lifecycle + IDOR integration tests (Round 5.3).
// service 직접 호출 — 세션 없이 도메인 검증.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  assessInboxItem,
  InboxServiceError,
  openInboxItem,
  runInboxFanout,
  transitionInboxItem,
} from "@/lib/inbox/service";
import { createOrReactivateWatch } from "@/lib/watches/service";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_INBOX_";

interface Tenant {
  ws: string;
  member: string;
  dept: string;
  documentId: string;
}
interface DualTenant { A: Tenant; B: Tenant; }

async function makeTenant(label: string, docId: string): Promise<Tenant> {
  const suffix = `${TEST_PREFIX}${label}_${randomUUID().slice(0, 6)}`;
  const user = await prisma.appUser.create({ data: { email: `${suffix}@t.local` } });
  const ws = await prisma.workspace.create({ data: { type: "PERSONAL", name: `WS_${suffix}` } });
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
  });
  const dept = await prisma.department.create({ data: { workspaceId: ws.id, name: `Dept_${suffix}` } });
  return { ws: ws.id, member: member.id, dept: dept.id, documentId: docId };
}

async function makeEvent(docId: string): Promise<string> {
  // 실 문서에 새 version + event 하나 만듦. notificationEligible=true.
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

let ctx: DualTenant;
let sharedDocId: string;

beforeAll(async () => {
  await cleanup();
  const doc = await prisma.legalDocument.findFirst({ select: { id: true } });
  if (!doc) throw new Error("prerequisite: LegalDocument");
  sharedDocId = doc.id;
  const [A, B] = await Promise.all([
    makeTenant("A", sharedDocId),
    makeTenant("B", sharedDocId),
  ]);
  ctx = { A, B };
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────
describe("Inbox fan-out", () => {
  it("Case 1: ACTIVE Watch + notifyOnChange=true → 이벤트 발생 시 Inbox 생성", async () => {
    // A workspace 에 Watch 등록 (default notifyOnChange=true)
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      sharedDocId,
    );
    // 새 이벤트 발생
    const eventId = await makeEvent(sharedDocId);

    const report = await runInboxFanout();
    expect(report.outboxEnqueued).toBeGreaterThanOrEqual(1);
    expect(report.inboxCreated).toBeGreaterThanOrEqual(1);

    const inbox = await prisma.changeInboxItem.findFirst({
      where: { workspaceId: ctx.A.ws, changeEventId: eventId },
    });
    expect(inbox).not.toBeNull();
    expect(inbox!.status).toBe("NEW");
    expect(inbox!.watchId).toBe(w.watch.id);

    // 정리
    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.watch.deleteMany({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: w.watch.id } });
  });

  it("Case 2: 두 번 실행해도 Inbox 는 1개 (idempotent)", async () => {
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      sharedDocId,
    );
    const eventId = await makeEvent(sharedDocId);

    await runInboxFanout();
    await runInboxFanout(); // 재실행

    const count = await prisma.changeInboxItem.count({
      where: { workspaceId: ctx.A.ws, changeEventId: eventId },
    });
    expect(count).toBe(1);

    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.watch.deleteMany({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: w.watch.id } });
  });

  it("Case 3: Watch 없는 workspace 는 Inbox 생성 안 됨", async () => {
    // B workspace 에는 Watch 없음
    const eventId = await makeEvent(sharedDocId);
    await runInboxFanout();

    const bInbox = await prisma.changeInboxItem.count({
      where: { workspaceId: ctx.B.ws, changeEventId: eventId },
    });
    expect(bInbox).toBe(0);

    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
  });

  it("Case 4: notifyOnChange=false Watch 는 fan-out 대상 아님", async () => {
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      sharedDocId,
    );
    await prisma.watch.update({ where: { id: w.watch.id }, data: { notifyOnChange: false } });
    const eventId = await makeEvent(sharedDocId);

    await runInboxFanout();

    const inbox = await prisma.changeInboxItem.count({
      where: { workspaceId: ctx.A.ws, changeEventId: eventId },
    });
    expect(inbox).toBe(0);

    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.watch.deleteMany({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: w.watch.id } });
  });

  it("Case 5: notificationEligible=false 이벤트는 outbox enqueue 안 됨 (HISTORICAL_IMPORT)", async () => {
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      sharedDocId,
    );
    const suffix = randomUUID().slice(0, 8);
    const version = await prisma.legalDocumentVersion.create({
      data: {
        documentId: sharedDocId,
        externalVersionId: `${TEST_PREFIX}v_hist_${suffix}`,
        revisionType: "일부개정",
        contentHash: `hash_hist_${suffix}`,
      },
    });
    const event = await prisma.legalChangeEvent.create({
      data: {
        documentId: sharedDocId,
        newVersionId: version.id,
        eventType: "REVISION",
        discoveryType: "HISTORICAL_IMPORT",
        notificationEligible: false,
      },
    });

    await runInboxFanout();

    const outboxCount = await prisma.domainOutbox.count({
      where: { aggregateId: event.id, eventType: "LEGAL_CHANGE_PUBLISHED" },
    });
    expect(outboxCount).toBe(0);
    const inboxCount = await prisma.changeInboxItem.count({
      where: { workspaceId: ctx.A.ws, changeEventId: event.id },
    });
    expect(inboxCount).toBe(0);

    await prisma.legalChangeEvent.delete({ where: { id: event.id } });
    await prisma.watch.deleteMany({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: w.watch.id } });
  });

  it("Case 6: Watch importance 를 Inbox priority 로 매핑", async () => {
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      sharedDocId,
    );
    await prisma.watch.update({
      where: { id: w.watch.id },
      data: { importance: "HIGH", ownerDepartmentId: ctx.A.dept, ownerMemberId: ctx.A.member },
    });
    const eventId = await makeEvent(sharedDocId);

    await runInboxFanout();

    const inbox = await prisma.changeInboxItem.findFirst({
      where: { workspaceId: ctx.A.ws, changeEventId: eventId },
    });
    expect(inbox?.priority).toBe("HIGH");
    // Watch 의 owner/dept 도 상속되었어야 함
    expect(inbox?.assignedToMemberId).toBe(ctx.A.member);
    expect(inbox?.ownerDepartmentId).toBe(ctx.A.dept);

    await prisma.changeInboxItem.deleteMany({ where: { changeEventId: eventId } });
    await prisma.legalChangeEvent.delete({ where: { id: eventId } });
    await prisma.watch.deleteMany({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: w.watch.id } });
  });
});

// ─────────────────────────────────────────────────────────────
describe("Inbox lifecycle", () => {
  async function seedInbox(): Promise<{ inboxId: string; eventId: string; watchId: string }> {
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      sharedDocId,
    );
    const eventId = await makeEvent(sharedDocId);
    await runInboxFanout();
    const inbox = await prisma.changeInboxItem.findFirstOrThrow({
      where: { workspaceId: ctx.A.ws, changeEventId: eventId },
    });
    return { inboxId: inbox.id, eventId, watchId: w.watch.id };
  }

  async function cleanupInbox(seed: { inboxId: string; eventId: string; watchId: string }) {
    await prisma.changeInboxItem.deleteMany({ where: { id: seed.inboxId } });
    await prisma.legalChangeEvent.deleteMany({ where: { id: seed.eventId } });
    await prisma.watch.deleteMany({ where: { id: seed.watchId } });
    await prisma.workspaceAuditLog.deleteMany({
      where: { entityId: { in: [seed.inboxId, seed.watchId] } },
    });
  }

  it("Case 7: openInboxItem NEW → REVIEWING + openedAt 설정 + audit", async () => {
    const seed = await seedInbox();
    await openInboxItem({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, seed.inboxId);

    const inbox = await prisma.changeInboxItem.findUnique({ where: { id: seed.inboxId } });
    expect(inbox?.status).toBe("REVIEWING");
    expect(inbox?.openedAt).not.toBeNull();

    const audit = await prisma.workspaceAuditLog.count({
      where: { entityId: seed.inboxId, action: "INBOX_OPENED" },
    });
    expect(audit).toBe(1);

    await cleanupInbox(seed);
  });

  it("Case 8: transition REVIEWING → DONE + completedAt + audit", async () => {
    const seed = await seedInbox();
    await openInboxItem({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, seed.inboxId);
    await transitionInboxItem({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, seed.inboxId, "DONE");

    const inbox = await prisma.changeInboxItem.findUnique({ where: { id: seed.inboxId } });
    expect(inbox?.status).toBe("DONE");
    expect(inbox?.completedAt).not.toBeNull();

    await cleanupInbox(seed);
  });

  it("Case 9: 불법 transition (NEW → DONE) 은 INVALID_TRANSITION", async () => {
    const seed = await seedInbox();
    await expect(
      transitionInboxItem({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, seed.inboxId, "DONE"),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await cleanupInbox(seed);
  });

  it("Case 10: assess — applicability/impact/text/dept/member 저장", async () => {
    const seed = await seedInbox();
    await assessInboxItem(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      seed.inboxId,
      {
        applicability: "APPLICABLE",
        applicabilityReason: "우리 조직 대상",
        impactLevel: "HIGH",
        assessmentText: "3분기 안에 사규 개정 필요",
        ownerDepartmentId: ctx.A.dept,
        assignedToMemberId: ctx.A.member,
      },
    );
    const inbox = await prisma.changeInboxItem.findUnique({ where: { id: seed.inboxId } });
    expect(inbox?.applicability).toBe("APPLICABLE");
    expect(inbox?.impactLevel).toBe("HIGH");
    expect(inbox?.assessmentText).toBe("3분기 안에 사규 개정 필요");
    expect(inbox?.ownerDepartmentId).toBe(ctx.A.dept);
    expect(inbox?.assignedToMemberId).toBe(ctx.A.member);

    await cleanupInbox(seed);
  });

  it("Case 11: cross-workspace assessment 에서 다른 워크스페이스의 dept 지정 시 reject", async () => {
    const seed = await seedInbox();
    await expect(
      assessInboxItem(
        { workspaceId: ctx.A.ws, memberId: ctx.A.member },
        seed.inboxId,
        { ownerDepartmentId: ctx.B.dept },
      ),
    ).rejects.toMatchObject({ code: "DEPARTMENT_NOT_IN_WORKSPACE" });

    await cleanupInbox(seed);
  });

  it("Case 12: cross-workspace IDOR — B 사용자가 A inbox 조작 시도 → INBOX_NOT_FOUND", async () => {
    const seed = await seedInbox();
    await expect(
      transitionInboxItem({ workspaceId: ctx.B.ws, memberId: ctx.B.member }, seed.inboxId, "DONE"),
    ).rejects.toMatchObject({ code: "INBOX_NOT_FOUND" });
    await expect(
      openInboxItem({ workspaceId: ctx.B.ws, memberId: ctx.B.member }, seed.inboxId),
    ).rejects.toMatchObject({ code: "INBOX_NOT_FOUND" });
    await expect(
      assessInboxItem(
        { workspaceId: ctx.B.ws, memberId: ctx.B.member },
        seed.inboxId,
        { impactLevel: "CRITICAL" },
      ),
    ).rejects.toMatchObject({ code: "INBOX_NOT_FOUND" });

    // 원래 상태 유지
    const inbox = await prisma.changeInboxItem.findUnique({ where: { id: seed.inboxId } });
    expect(inbox?.status).toBe("NEW");
    expect(inbox?.impactLevel).toBeNull();

    await cleanupInbox(seed);
  });
});
