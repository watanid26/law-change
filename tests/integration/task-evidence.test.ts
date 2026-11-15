// Task / Evidence integration tests (Round 5.4).
// 개인 사용 전용 시나리오 + Inbox 연동 자동 전환 + IDOR.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  addEvidence,
  createStandaloneTask,
  createTaskFromInbox,
  softDeleteEvidence,
  TaskServiceError,
  transitionTask,
  updateTask,
} from "@/lib/tasks/service";
import { createOrReactivateWatch } from "@/lib/watches/service";
import { runInboxFanout } from "@/lib/inbox/service";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_TASK_";

interface Tenant { ws: string; member: string; dept: string; documentId: string; }
interface Dual { A: Tenant; B: Tenant; }

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

let ctx: Dual;
let sharedDocId: string;

beforeAll(async () => {
  await cleanup();
  const doc = await prisma.legalDocument.findFirst({ select: { id: true } });
  if (!doc) throw new Error("prerequisite: LegalDocument");
  sharedDocId = doc.id;
  const [A, B] = await Promise.all([makeTenant("A", sharedDocId), makeTenant("B", sharedDocId)]);
  ctx = { A, B };
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function seedInbox(tenant: Tenant): Promise<{ inboxId: string; eventId: string; watchId: string }> {
  const w = await createOrReactivateWatch(
    { workspaceId: tenant.ws, memberId: tenant.member },
    tenant.documentId,
  );
  const eventId = await makeEvent(tenant.documentId);
  await runInboxFanout();
  const inbox = await prisma.changeInboxItem.findFirstOrThrow({
    where: { workspaceId: tenant.ws, changeEventId: eventId },
  });
  return { inboxId: inbox.id, eventId, watchId: w.watch.id };
}

async function cleanupInbox(tenant: Tenant, s: { inboxId: string; eventId: string; watchId: string }) {
  await prisma.evidence.deleteMany({ where: { task: { inboxItemId: s.inboxId } } });
  await prisma.task.deleteMany({ where: { inboxItemId: s.inboxId } });
  await prisma.changeInboxItem.deleteMany({ where: { id: s.inboxId } });
  await prisma.legalChangeEvent.deleteMany({ where: { id: s.eventId } });
  await prisma.watch.deleteMany({ where: { id: s.watchId } });
  await prisma.workspaceAuditLog.deleteMany({
    where: { workspaceId: tenant.ws, entityId: { in: [s.inboxId, s.watchId] } },
  });
}

// ─────────────────────────────────────────────────────────────
describe("Task create — from Inbox", () => {
  it("Case 1: create → assignee=self, priority 상속, Inbox 자동 ACTION_REQUIRED 승격", async () => {
    const s = await seedInbox(ctx.A);
    // Inbox 는 NEW → priority=NORMAL
    const task = await createTaskFromInbox(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { inboxItemId: s.inboxId, title: "개인정보처리방침 갱신" },
    );
    const t = await prisma.task.findUnique({ where: { id: task.id } });
    expect(t?.title).toBe("개인정보처리방침 갱신");
    expect(t?.status).toBe("TODO");
    expect(t?.assigneeMemberId).toBe(ctx.A.member);
    expect(t?.createdByMemberId).toBe(ctx.A.member);
    expect(t?.priority).toBe("NORMAL");

    const inbox = await prisma.changeInboxItem.findUnique({ where: { id: s.inboxId } });
    expect(inbox?.status).toBe("ACTION_REQUIRED");

    const audit = await prisma.workspaceAuditLog.count({
      where: { workspaceId: ctx.A.ws, entityId: task.id, action: "TASK_CREATED" },
    });
    expect(audit).toBe(1);

    await cleanupInbox(ctx.A, s);
  });

  it("Case 2: cross-workspace inbox 로 create 시도 → INBOX_NOT_FOUND", async () => {
    const s = await seedInbox(ctx.A);
    await expect(
      createTaskFromInbox(
        { workspaceId: ctx.B.ws, memberId: ctx.B.member },
        { inboxItemId: s.inboxId, title: "hijack" },
      ),
    ).rejects.toMatchObject({ code: "INBOX_NOT_FOUND" });
    await cleanupInbox(ctx.A, s);
  });
});

describe("Task create — standalone", () => {
  it("Case 3: 독립 Task → assignee=self, inboxItemId=null", async () => {
    const task = await createStandaloneTask(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { title: "개인 컴플라이언스 점검", priority: "HIGH" },
    );
    const t = await prisma.task.findUnique({ where: { id: task.id } });
    expect(t?.title).toBe("개인 컴플라이언스 점검");
    expect(t?.priority).toBe("HIGH");
    expect(t?.inboxItemId).toBeNull();
    expect(t?.assigneeMemberId).toBe(ctx.A.member);
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: task.id } });
  });
});

describe("Task transition", () => {
  it("Case 4: TODO → IN_PROGRESS → DONE + startedAt / completedAt 자동 세팅", async () => {
    const task = await createStandaloneTask(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { title: "T4" },
    );
    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, task.id, "IN_PROGRESS");
    const t1 = await prisma.task.findUnique({ where: { id: task.id } });
    expect(t1?.status).toBe("IN_PROGRESS");
    expect(t1?.startedAt).not.toBeNull();
    expect(t1?.completedAt).toBeNull();

    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, task.id, "DONE");
    const t2 = await prisma.task.findUnique({ where: { id: task.id } });
    expect(t2?.status).toBe("DONE");
    expect(t2?.completedAt).not.toBeNull();

    await prisma.task.delete({ where: { id: task.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: task.id } });
  });

  it("Case 5: 불법 transition (DONE → TODO 는 불가; CANCELLED → TODO 만 허용)", async () => {
    const task = await createStandaloneTask(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { title: "T5" },
    );
    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, task.id, "IN_PROGRESS");
    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, task.id, "DONE");
    await expect(
      transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, task.id, "TODO"),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: task.id } });
  });
});

describe("Task-Inbox auto transitions", () => {
  it("Case 6: Inbox 마지막 열린 Task 가 DONE 되면 Inbox 도 자동 DONE", async () => {
    const s = await seedInbox(ctx.A);
    const t = await createTaskFromInbox(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { inboxItemId: s.inboxId, title: "one" },
    );
    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, t.id, "IN_PROGRESS");
    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, t.id, "DONE");
    const inbox = await prisma.changeInboxItem.findUnique({ where: { id: s.inboxId } });
    expect(inbox?.status).toBe("DONE");
    expect(inbox?.completedAt).not.toBeNull();
    await cleanupInbox(ctx.A, s);
  });

  it("Case 7: 다른 Task 가 남아있으면 Inbox 는 DONE 되지 않음", async () => {
    const s = await seedInbox(ctx.A);
    const t1 = await createTaskFromInbox(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { inboxItemId: s.inboxId, title: "one" },
    );
    const t2 = await createTaskFromInbox(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { inboxItemId: s.inboxId, title: "two" },
    );
    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, t1.id, "IN_PROGRESS");
    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, t1.id, "DONE");
    const inboxAfterOne = await prisma.changeInboxItem.findUnique({ where: { id: s.inboxId } });
    expect(inboxAfterOne?.status).toBe("ACTION_REQUIRED"); // 여전히 open

    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, t2.id, "IN_PROGRESS");
    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, t2.id, "DONE");
    const inboxAfterTwo = await prisma.changeInboxItem.findUnique({ where: { id: s.inboxId } });
    expect(inboxAfterTwo?.status).toBe("DONE");
    await cleanupInbox(ctx.A, s);
  });

  it("Case 8: DONE 된 Task 를 재개하면 Inbox 도 ACTION_REQUIRED 로 복귀", async () => {
    const s = await seedInbox(ctx.A);
    const t = await createTaskFromInbox(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { inboxItemId: s.inboxId, title: "reopen" },
    );
    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, t.id, "IN_PROGRESS");
    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, t.id, "DONE");
    const inbox1 = await prisma.changeInboxItem.findUnique({ where: { id: s.inboxId } });
    expect(inbox1?.status).toBe("DONE");

    await transitionTask({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, t.id, "IN_PROGRESS");
    const inbox2 = await prisma.changeInboxItem.findUnique({ where: { id: s.inboxId } });
    expect(inbox2?.status).toBe("ACTION_REQUIRED");
    expect(inbox2?.completedAt).toBeNull();
    await cleanupInbox(ctx.A, s);
  });
});

describe("Evidence", () => {
  it("Case 9: addEvidence (LINK) + softDelete + audit", async () => {
    const task = await createStandaloneTask(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { title: "T9" },
    );
    const ev = await addEvidence(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      task.id,
      { type: "LINK", externalUrl: "https://example.com/policy.pdf" },
    );
    const e1 = await prisma.evidence.findUnique({ where: { id: ev.id } });
    expect(e1?.externalUrl).toBe("https://example.com/policy.pdf");
    expect(e1?.uploadedByMemberId).toBe(ctx.A.member);
    expect(e1?.deletedAt).toBeNull();

    await softDeleteEvidence({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, ev.id);
    const e2 = await prisma.evidence.findUnique({ where: { id: ev.id } });
    expect(e2).not.toBeNull(); // hard-delete 아님
    expect(e2?.deletedAt).not.toBeNull();

    const addedAudit = await prisma.workspaceAuditLog.count({
      where: { entityId: ev.id, action: "EVIDENCE_ADDED" },
    });
    const deletedAudit = await prisma.workspaceAuditLog.count({
      where: { entityId: ev.id, action: "EVIDENCE_DELETED" },
    });
    expect(addedAudit).toBe(1);
    expect(deletedAudit).toBe(1);

    await prisma.evidence.delete({ where: { id: ev.id } });
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: { in: [ev.id, task.id] } } });
  });

  it("Case 10: cross-workspace evidence add/delete → NOT_FOUND", async () => {
    const task = await createStandaloneTask(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { title: "T10" },
    );
    await expect(
      addEvidence(
        { workspaceId: ctx.B.ws, memberId: ctx.B.member },
        task.id,
        { type: "LINK", externalUrl: "https://evil" },
      ),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });

    // 정상적으로 A 가 evidence 추가한 뒤 B 가 삭제 시도
    const ev = await addEvidence(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      task.id,
      { type: "LINK", externalUrl: "https://example.com/x" },
    );
    await expect(
      softDeleteEvidence({ workspaceId: ctx.B.ws, memberId: ctx.B.member }, ev.id),
    ).rejects.toMatchObject({ code: "EVIDENCE_NOT_FOUND" });

    await prisma.evidence.delete({ where: { id: ev.id } });
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: { in: [ev.id, task.id] } } });
  });
});

describe("Task update + IDOR", () => {
  it("Case 11: 필드 부분 업데이트 + audit", async () => {
    const task = await createStandaloneTask(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { title: "T11" },
    );
    await updateTask(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      task.id,
      { title: "수정된 제목", priority: "URGENT", dueAt: new Date().toISOString() },
    );
    const t = await prisma.task.findUnique({ where: { id: task.id } });
    expect(t?.title).toBe("수정된 제목");
    expect(t?.priority).toBe("URGENT");
    expect(t?.dueAt).not.toBeNull();
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: task.id } });
  });

  it("Case 12: cross-workspace task update/transition IDOR → TASK_NOT_FOUND, 원본 무변화", async () => {
    const task = await createStandaloneTask(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { title: "T12" },
    );
    await expect(
      updateTask(
        { workspaceId: ctx.B.ws, memberId: ctx.B.member },
        task.id,
        { title: "hijacked" },
      ),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(
      transitionTask({ workspaceId: ctx.B.ws, memberId: ctx.B.member }, task.id, "DONE"),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    const t = await prisma.task.findUnique({ where: { id: task.id } });
    expect(t?.title).toBe("T12");
    expect(t?.status).toBe("TODO");
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: task.id } });
  });
});
