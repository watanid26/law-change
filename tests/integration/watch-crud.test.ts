// Watch CRUD service integration tests (Round 5.2).
// Server Action 을 우회하여 service 직접 호출 — 세션/미들웨어 mock 없이 도메인 검증.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  archiveWatch,
  createOrReactivateWatch,
  markWatchReviewed,
  updateWatch,
  WatchServiceError,
} from "@/lib/watches/service";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_WATCH_";

interface Fixture {
  ws: string;
  member: string;
  dept: string;
  documentId: string;
}
interface DualFixture { A: Fixture; B: Fixture; }

async function makeFixture(label: string): Promise<Fixture> {
  const suffix = `${TEST_PREFIX}${label}_${randomUUID().slice(0, 6)}`;
  const user = await prisma.appUser.create({ data: { email: `${suffix}@t.local` } });
  const ws = await prisma.workspace.create({ data: { type: "PERSONAL", name: `WS_${suffix}` } });
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
  });
  const dept = await prisma.department.create({ data: { workspaceId: ws.id, name: `Dept_${suffix}` } });
  const doc = await prisma.legalDocument.findFirst({ select: { id: true } });
  if (!doc) throw new Error("prerequisite: at least one LegalDocument");
  return { ws: ws.id, member: member.id, dept: dept.id, documentId: doc.id };
}

async function cleanupAll() {
  await prisma.workspace.deleteMany({ where: { name: { startsWith: `WS_${TEST_PREFIX}` } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

let ctx: DualFixture;

beforeAll(async () => {
  await cleanupAll();
  const [A, B] = await Promise.all([makeFixture("A"), makeFixture("B")]);
  ctx = { A, B };
});

afterAll(async () => {
  await cleanupAll();
  await prisma.$disconnect();
});

describe("Watch service — createOrReactivate", () => {
  it("Case 1: 최초 create → ACTIVE + audit WATCH_CREATED + defaults", async () => {
    const res = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    expect(res.outcome).toBe("CREATED");
    const w = await prisma.watch.findUnique({ where: { id: res.watch.id } });
    expect(w?.status).toBe("ACTIVE");
    expect(w?.applicabilityStatus).toBe("UNKNOWN");
    expect(w?.importance).toBe("NORMAL");
    expect(w?.notifyOnChange).toBe(true);
    expect(w?.createdByMemberId).toBe(ctx.A.member);

    const audit = await prisma.workspaceAuditLog.count({
      where: { workspaceId: ctx.A.ws, entityId: res.watch.id, action: "WATCH_CREATED" },
    });
    expect(audit).toBe(1);

    await prisma.watch.deleteMany({ where: { id: res.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: res.watch.id } });
  });

  it("Case 2: idempotent — 두 번째 호출은 ALREADY_ACTIVE, Watch 1개", async () => {
    const a = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    const b = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    expect(b.outcome).toBe("ALREADY_ACTIVE");
    expect(b.watch.id).toBe(a.watch.id);
    const count = await prisma.watch.count({
      where: { workspaceId: ctx.A.ws, documentId: ctx.A.documentId },
    });
    expect(count).toBe(1);
    await prisma.watch.delete({ where: { id: a.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: a.watch.id } });
  });

  it("Case 3: concurrent create → Watch 정확히 1개, 두 응답 모두 성공", async () => {
    const [a, b] = await Promise.all([
      createOrReactivateWatch({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, ctx.A.documentId),
      createOrReactivateWatch({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, ctx.A.documentId),
    ]);
    expect(a.watch.id).toBe(b.watch.id);
    const count = await prisma.watch.count({
      where: { workspaceId: ctx.A.ws, documentId: ctx.A.documentId },
    });
    expect(count).toBe(1);
    await prisma.watch.delete({ where: { id: a.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: a.watch.id } });
  });

  it("Case 4: unknown documentId → DOCUMENT_NOT_FOUND", async () => {
    await expect(
      createOrReactivateWatch(
        { workspaceId: ctx.A.ws, memberId: ctx.A.member },
        "no_such_document_zzz",
      ),
    ).rejects.toBeInstanceOf(WatchServiceError);
  });
});

describe("Watch service — archive / reactivate", () => {
  it("Case 5: archive → status ARCHIVED, row 유지, audit WATCH_ARCHIVED", async () => {
    const a = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    await archiveWatch({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, a.watch.id);

    const w = await prisma.watch.findUnique({ where: { id: a.watch.id } });
    expect(w).not.toBeNull();
    expect(w!.status).toBe("ARCHIVED");
    expect(w!.archivedAt).not.toBeNull();

    const audit = await prisma.workspaceAuditLog.count({
      where: { workspaceId: ctx.A.ws, entityId: a.watch.id, action: "WATCH_ARCHIVED" },
    });
    expect(audit).toBe(1);

    // Case 6: reactivate → same id, ACTIVE 로 복귀, audit WATCH_REACTIVATED
    const again = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    expect(again.outcome).toBe("REACTIVATED");
    expect(again.watch.id).toBe(a.watch.id);
    const w2 = await prisma.watch.findUnique({ where: { id: a.watch.id } });
    expect(w2!.status).toBe("ACTIVE");
    expect(w2!.archivedAt).toBeNull();

    const reactAudit = await prisma.workspaceAuditLog.count({
      where: { workspaceId: ctx.A.ws, entityId: a.watch.id, action: "WATCH_REACTIVATED" },
    });
    expect(reactAudit).toBe(1);

    await prisma.watch.delete({ where: { id: a.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: a.watch.id } });
  });
});

describe("Watch service — update", () => {
  it("Case 7: applicability + importance + reason 저장 + audit WATCH_UPDATED", async () => {
    const a = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    await updateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      a.watch.id,
      {
        applicabilityStatus: "APPLICABLE",
        applicabilityReason: "온라인 서비스에서 개인정보 처리",
        importance: "HIGH",
        notifyOnChange: false,
      },
    );
    const w = await prisma.watch.findUnique({ where: { id: a.watch.id } });
    expect(w!.applicabilityStatus).toBe("APPLICABLE");
    expect(w!.importance).toBe("HIGH");
    expect(w!.applicabilityReason).toBe("온라인 서비스에서 개인정보 처리");
    expect(w!.notifyOnChange).toBe(false);

    const audit = await prisma.workspaceAuditLog.count({
      where: { entityId: a.watch.id, action: "WATCH_UPDATED" },
    });
    expect(audit).toBeGreaterThanOrEqual(1);

    await prisma.watch.delete({ where: { id: a.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: a.watch.id } });
  });

  it("Case 8: cross-workspace department 지정 → DEPARTMENT_NOT_IN_WORKSPACE (raw FK error 아님)", async () => {
    const a = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    await expect(
      updateWatch(
        { workspaceId: ctx.A.ws, memberId: ctx.A.member },
        a.watch.id,
        { ownerDepartmentId: ctx.B.dept },
      ),
    ).rejects.toMatchObject({ code: "DEPARTMENT_NOT_IN_WORKSPACE" });

    await prisma.watch.delete({ where: { id: a.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: a.watch.id } });
  });

  it("Case 9: cross-workspace watch IDOR → WATCH_NOT_FOUND", async () => {
    // A workspace 에서 Watch 생성
    const a = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    // B user 가 A watchId 로 update 시도
    await expect(
      updateWatch(
        { workspaceId: ctx.B.ws, memberId: ctx.B.member },
        a.watch.id,
        { importance: "URGENT" },
      ),
    ).rejects.toMatchObject({ code: "WATCH_NOT_FOUND" });
    // B user 가 archive 시도
    await expect(
      archiveWatch({ workspaceId: ctx.B.ws, memberId: ctx.B.member }, a.watch.id),
    ).rejects.toMatchObject({ code: "WATCH_NOT_FOUND" });

    // A row 는 변화 없음
    const w = await prisma.watch.findUnique({ where: { id: a.watch.id } });
    expect(w!.importance).toBe("NORMAL");
    expect(w!.status).toBe("ACTIVE");

    await prisma.watch.delete({ where: { id: a.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: a.watch.id } });
  });
});

describe("Watch service — review completed", () => {
  it("Case 10: reviewFrequency 있으면 nextReviewAt 계산 + WATCH_REVIEWED audit", async () => {
    const a = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    await updateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      a.watch.id,
      { reviewFrequencyMonths: 3 },
    );

    await markWatchReviewed({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, a.watch.id);
    const w = await prisma.watch.findUnique({ where: { id: a.watch.id } });
    expect(w!.lastReviewedAt).not.toBeNull();
    expect(w!.nextReviewAt).not.toBeNull();
    // 대략 3개월 후 (1일 오차 허용)
    const diffMs = (w!.nextReviewAt!.getTime() - w!.lastReviewedAt!.getTime());
    const expectedMinMs = 89 * 24 * 60 * 60 * 1000;
    const expectedMaxMs = 93 * 24 * 60 * 60 * 1000;
    expect(diffMs).toBeGreaterThanOrEqual(expectedMinMs);
    expect(diffMs).toBeLessThanOrEqual(expectedMaxMs);

    const audit = await prisma.workspaceAuditLog.count({
      where: { entityId: a.watch.id, action: "WATCH_REVIEWED" },
    });
    expect(audit).toBe(1);

    await prisma.watch.delete({ where: { id: a.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: a.watch.id } });
  });
});
