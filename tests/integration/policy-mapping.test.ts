// Policy + LegalPolicyMapping integration tests (Round 5.5e).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  createPolicy,
  mapPolicyToWatch,
  PolicyServiceError,
  removeMapping,
} from "@/lib/policies/service";
import { createOrReactivateWatch } from "@/lib/watches/service";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_POLICY_";

interface Tenant { ws: string; member: string; documentId: string; }
interface Dual { A: Tenant; B: Tenant; }

async function makeTenant(label: string, docId: string): Promise<Tenant> {
  const suffix = `${TEST_PREFIX}${label}_${randomUUID().slice(0, 6)}`;
  const user = await prisma.appUser.create({ data: { email: `${suffix}@t.local` } });
  const ws = await prisma.workspace.create({ data: { type: "PERSONAL", name: `WS_${suffix}` } });
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
  });
  return { ws: ws.id, member: member.id, documentId: docId };
}

async function cleanup() {
  await prisma.workspace.deleteMany({ where: { name: { startsWith: `WS_${TEST_PREFIX}` } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

let ctx: Dual;

beforeAll(async () => {
  await cleanup();
  const doc = await prisma.legalDocument.findFirst({ select: { id: true } });
  if (!doc) throw new Error("prerequisite: LegalDocument");
  const [A, B] = await Promise.all([makeTenant("A", doc.id), makeTenant("B", doc.id)]);
  ctx = { A, B };
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("InternalPolicy CRUD + Mapping", () => {
  it("Case 1: policy 생성 + Watch 에 mapping + 재mapping = idempotent + audit", async () => {
    const p = await createPolicy(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { type: "PRIVACY_POLICY", title: "개인정보처리방침" },
    );
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    const m1 = await mapPolicyToWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      w.watch.id,
      p.id,
    );
    // 재호출은 같은 mapping 반환
    const m2 = await mapPolicyToWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      w.watch.id,
      p.id,
    );
    expect(m1.id).toBe(m2.id);
    // audit 는 첫 호출에만
    const audits = await prisma.workspaceAuditLog.count({
      where: { entityId: m1.id, action: "POLICY_MAPPING_CREATED" },
    });
    expect(audits).toBe(1);

    // cleanup
    await prisma.legalPolicyMapping.delete({ where: { id: m1.id } });
    await prisma.internalPolicy.delete({ where: { id: p.id } });
    await prisma.watch.delete({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({
      where: { entityId: { in: [m1.id, p.id, w.watch.id] } },
    });
  });

  it("Case 2: cross-workspace watch 로 mapping 시도 → WATCH_NOT_FOUND", async () => {
    const p = await createPolicy(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { type: "REGULATION", title: "사내 규정" },
    );
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    await expect(
      mapPolicyToWatch(
        { workspaceId: ctx.B.ws, memberId: ctx.B.member },
        w.watch.id,
        p.id,
      ),
    ).rejects.toMatchObject({ code: "WATCH_NOT_FOUND" });
    await prisma.internalPolicy.delete({ where: { id: p.id } });
    await prisma.watch.delete({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: { in: [p.id, w.watch.id] } } });
  });

  it("Case 3: cross-workspace policy 로 mapping 시도 → POLICY_NOT_FOUND", async () => {
    const p = await createPolicy(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { type: "REGULATION", title: "A 규정" },
    );
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.B.ws, memberId: ctx.B.member },
      ctx.B.documentId,
    );
    await expect(
      mapPolicyToWatch(
        { workspaceId: ctx.B.ws, memberId: ctx.B.member },
        w.watch.id,
        p.id,
      ),
    ).rejects.toMatchObject({ code: "POLICY_NOT_FOUND" });
    await prisma.internalPolicy.delete({ where: { id: p.id } });
    await prisma.watch.delete({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({ where: { entityId: { in: [p.id, w.watch.id] } } });
  });

  it("Case 4: mapping 삭제 + audit", async () => {
    const p = await createPolicy(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { type: "SOP", title: "SOP" },
    );
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    const m = await mapPolicyToWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      w.watch.id,
      p.id,
    );
    await removeMapping({ workspaceId: ctx.A.ws, memberId: ctx.A.member }, m.id);
    const exists = await prisma.legalPolicyMapping.findUnique({ where: { id: m.id } });
    expect(exists).toBeNull();
    const audit = await prisma.workspaceAuditLog.count({
      where: { entityId: m.id, action: "POLICY_MAPPING_REMOVED" },
    });
    expect(audit).toBe(1);
    await prisma.internalPolicy.delete({ where: { id: p.id } });
    await prisma.watch.delete({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({
      where: { entityId: { in: [m.id, p.id, w.watch.id] } },
    });
  });

  it("Case 5: cross-workspace mapping 삭제 시도 → MAPPING_NOT_FOUND", async () => {
    const p = await createPolicy(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      { type: "OTHER", title: "테스트" },
    );
    const w = await createOrReactivateWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      ctx.A.documentId,
    );
    const m = await mapPolicyToWatch(
      { workspaceId: ctx.A.ws, memberId: ctx.A.member },
      w.watch.id,
      p.id,
    );
    await expect(
      removeMapping({ workspaceId: ctx.B.ws, memberId: ctx.B.member }, m.id),
    ).rejects.toBeInstanceOf(PolicyServiceError);
    await prisma.legalPolicyMapping.delete({ where: { id: m.id } });
    await prisma.internalPolicy.delete({ where: { id: p.id } });
    await prisma.watch.delete({ where: { id: w.watch.id } });
    await prisma.workspaceAuditLog.deleteMany({
      where: { entityId: { in: [m.id, p.id, w.watch.id] } },
    });
  });
});
