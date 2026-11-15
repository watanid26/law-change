// Integration test: Cross-workspace 데이터 결합 원천 차단 (composite FK)
// 각 관계에 대해:
//   - same-workspace: 성공
//   - cross-workspace: DB 실패 (FK 위반)
// application validation 이 아니라 DB constraint 로 강제되는지 검증.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_TENANT_";

interface Tenant {
  user: string;
  ws: string;
  member: string;
  dept: string;
  folder: string;
}

async function makeTenant(label: string): Promise<Tenant> {
  const suffix = `${TEST_PREFIX}${label}_${randomUUID().slice(0, 6)}`;
  const user = await prisma.appUser.create({ data: { email: `${suffix}@t.local` } });
  const ws = await prisma.workspace.create({
    data: { type: "PERSONAL", name: `WS_${suffix}` },
  });
  const member = await prisma.workspaceMember.create({
    data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
  });
  const dept = await prisma.department.create({
    data: { workspaceId: ws.id, name: `Dept_${suffix}` },
  });
  const folder = await prisma.folder.create({
    data: { workspaceId: ws.id, name: `Folder_${suffix}` },
  });
  return { user: user.id, ws: ws.id, member: member.id, dept: dept.id, folder: folder.id };
}

async function cleanupTenants() {
  // Cascade 로 하위 전부 정리
  await prisma.workspace.deleteMany({ where: { name: { startsWith: `WS_${TEST_PREFIX}` } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

let A: Tenant;
let B: Tenant;
let doc: { id: string };

beforeAll(async () => {
  await cleanupTenants();
  A = await makeTenant("A");
  B = await makeTenant("B");
  // 실 corpus 에서 첫 문서 하나 사용 (Watch/Mapping 테스트용)
  const first = await prisma.legalDocument.findFirst({ select: { id: true } });
  if (!first) throw new Error("prerequisite: at least one LegalDocument in DB");
  doc = { id: first.id };
});

afterAll(async () => {
  await cleanupTenants();
  await prisma.$disconnect();
});

// ────────────────────────────────────────────────────────────────
describe("DepartmentMember cross-workspace 차단", () => {
  it("same workspace: 성공", async () => {
    const dm = await prisma.departmentMember.create({
      data: { workspaceId: A.ws, departmentId: A.dept, workspaceMemberId: A.member },
    });
    expect(dm.id).toBeTruthy();
    await prisma.departmentMember.delete({ where: { id: dm.id } });
  });

  it("cross-workspace department: DB 실패", async () => {
    await expect(
      prisma.departmentMember.create({
        data: { workspaceId: A.ws, departmentId: B.dept, workspaceMemberId: A.member },
      }),
    ).rejects.toThrow();
  });

  it("cross-workspace member: DB 실패", async () => {
    await expect(
      prisma.departmentMember.create({
        data: { workspaceId: A.ws, departmentId: A.dept, workspaceMemberId: B.member },
      }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
describe("Department/Folder parent same-workspace", () => {
  it("Department: same-workspace parent OK", async () => {
    const child = await prisma.department.create({
      data: { workspaceId: A.ws, name: `${TEST_PREFIX}child_${randomUUID().slice(0,4)}`, parentId: A.dept },
    });
    expect(child.parentId).toBe(A.dept);
    await prisma.department.delete({ where: { id: child.id } });
  });

  it("Department: cross-workspace parent 실패", async () => {
    await expect(
      prisma.department.create({
        data: { workspaceId: A.ws, name: `${TEST_PREFIX}bad_${randomUUID().slice(0,4)}`, parentId: B.dept },
      }),
    ).rejects.toThrow();
  });

  it("Folder: same-workspace parent OK", async () => {
    const child = await prisma.folder.create({
      data: { workspaceId: A.ws, name: `Sub_${randomUUID().slice(0,4)}`, parentId: A.folder },
    });
    expect(child.parentId).toBe(A.folder);
    await prisma.folder.delete({ where: { id: child.id } });
  });

  it("Folder: cross-workspace parent 실패", async () => {
    await expect(
      prisma.folder.create({
        data: { workspaceId: A.ws, name: `Sub_${randomUUID().slice(0,4)}`, parentId: B.folder },
      }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
describe("Watch cross-workspace 차단", () => {
  async function makeWatch(overrides: Partial<{
    workspaceId: string;
    documentId: string;
    createdByMemberId: string;
    ownerDepartmentId: string | null;
    ownerMemberId: string | null;
    folderId: string | null;
  }>) {
    return prisma.watch.create({
      data: {
        workspaceId: overrides.workspaceId ?? A.ws,
        documentId: overrides.documentId ?? doc.id,
        createdByMemberId: overrides.createdByMemberId ?? A.member,
        ownerDepartmentId: overrides.ownerDepartmentId ?? undefined,
        ownerMemberId: overrides.ownerMemberId ?? undefined,
        folderId: overrides.folderId ?? undefined,
      },
    });
  }

  afterEach(async () => {
    await prisma.watch.deleteMany({ where: { workspaceId: { in: [A.ws, B.ws] } } });
  });

  it("all same-workspace: 성공", async () => {
    const w = await makeWatch({ ownerDepartmentId: A.dept, ownerMemberId: A.member, folderId: A.folder });
    expect(w.id).toBeTruthy();
  });

  it("cross-workspace ownerDepartment: 실패", async () => {
    await expect(makeWatch({ ownerDepartmentId: B.dept })).rejects.toThrow();
  });

  it("cross-workspace ownerMember: 실패", async () => {
    await expect(makeWatch({ ownerMemberId: B.member })).rejects.toThrow();
  });

  it("cross-workspace creator: 실패", async () => {
    await expect(makeWatch({ createdByMemberId: B.member })).rejects.toThrow();
  });

  it("cross-workspace folder: 실패", async () => {
    await expect(makeWatch({ folderId: B.folder })).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
describe("ChangeInboxItem cross-workspace 차단", () => {
  let event: { id: string };
  let watchA: { id: string };

  beforeAll(async () => {
    // 기존 corpus 에서 아무 이벤트 하나 사용
    const e = await prisma.legalChangeEvent.findFirst({ select: { id: true } });
    if (!e) throw new Error("prerequisite: LegalChangeEvent");
    event = e;
    // Watch A 준비
    const w = await prisma.watch.create({
      data: { workspaceId: A.ws, documentId: doc.id, createdByMemberId: A.member },
    });
    watchA = w;
  });

  afterAll(async () => {
    await prisma.changeInboxItem.deleteMany({ where: { workspaceId: { in: [A.ws, B.ws] } } });
    await prisma.watch.deleteMany({ where: { id: watchA.id } });
  });

  it("same-workspace 관계 모두 OK", async () => {
    const inbox = await prisma.changeInboxItem.create({
      data: {
        workspaceId: A.ws,
        changeEventId: event.id,
        watchId: watchA.id,
        assignedToMemberId: A.member,
        ownerDepartmentId: A.dept,
      },
    });
    expect(inbox.id).toBeTruthy();
  });

  it("cross-workspace assignee: 실패", async () => {
    await expect(
      prisma.changeInboxItem.create({
        data: { workspaceId: B.ws, changeEventId: event.id, assignedToMemberId: A.member },
      }),
    ).rejects.toThrow();
  });

  it("cross-workspace ownerDepartment: 실패", async () => {
    await expect(
      prisma.changeInboxItem.create({
        data: { workspaceId: B.ws, changeEventId: event.id, ownerDepartmentId: A.dept },
      }),
    ).rejects.toThrow();
  });

  it("cross-workspace watch: 실패", async () => {
    await expect(
      prisma.changeInboxItem.create({
        data: { workspaceId: B.ws, changeEventId: event.id, watchId: watchA.id },
      }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
describe("InboxAffectedDepartment cross-workspace 차단", () => {
  let inboxA: { id: string };

  beforeAll(async () => {
    const e = await prisma.legalChangeEvent.findFirst({ select: { id: true } });
    inboxA = await prisma.changeInboxItem.create({
      data: { workspaceId: A.ws, changeEventId: e!.id },
    });
  });

  afterAll(async () => {
    await prisma.changeInboxItem.deleteMany({ where: { id: inboxA.id } });
  });

  it("same-workspace: 성공", async () => {
    const iad = await prisma.inboxAffectedDepartment.create({
      data: { workspaceId: A.ws, inboxItemId: inboxA.id, departmentId: A.dept },
    });
    expect(iad.id).toBeTruthy();
    await prisma.inboxAffectedDepartment.delete({ where: { id: iad.id } });
  });

  it("cross-workspace department: 실패", async () => {
    await expect(
      prisma.inboxAffectedDepartment.create({
        data: { workspaceId: A.ws, inboxItemId: inboxA.id, departmentId: B.dept },
      }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
describe("Task cross-workspace 차단", () => {
  let inboxA: { id: string };

  beforeAll(async () => {
    const e = await prisma.legalChangeEvent.findFirst({ select: { id: true } });
    inboxA = await prisma.changeInboxItem.create({
      data: { workspaceId: A.ws, changeEventId: e!.id },
    });
  });

  afterEach(async () => {
    await prisma.task.deleteMany({ where: { workspaceId: { in: [A.ws, B.ws] } } });
  });

  afterAll(async () => {
    await prisma.changeInboxItem.deleteMany({ where: { id: inboxA.id } });
  });

  it("all same-workspace: 성공", async () => {
    const t = await prisma.task.create({
      data: {
        workspaceId: A.ws,
        title: "task1",
        createdByMemberId: A.member,
        inboxItemId: inboxA.id,
        ownerDepartmentId: A.dept,
        assigneeMemberId: A.member,
      },
    });
    expect(t.id).toBeTruthy();
  });

  it("cross-workspace inbox: 실패", async () => {
    await expect(
      prisma.task.create({
        data: { workspaceId: B.ws, title: "x", createdByMemberId: B.member, inboxItemId: inboxA.id },
      }),
    ).rejects.toThrow();
  });

  it("cross-workspace assignee: 실패", async () => {
    await expect(
      prisma.task.create({
        data: { workspaceId: A.ws, title: "x", createdByMemberId: A.member, assigneeMemberId: B.member },
      }),
    ).rejects.toThrow();
  });

  it("cross-workspace creator: 실패", async () => {
    await expect(
      prisma.task.create({
        data: { workspaceId: A.ws, title: "x", createdByMemberId: B.member },
      }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
describe("Evidence + TaskApproval cross-workspace 차단", () => {
  let taskA: { id: string };

  beforeAll(async () => {
    taskA = await prisma.task.create({
      data: { workspaceId: A.ws, title: "t_ev", createdByMemberId: A.member },
    });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { id: taskA.id } });
  });

  it("Evidence same-workspace: 성공", async () => {
    const ev = await prisma.evidence.create({
      data: { workspaceId: A.ws, taskId: taskA.id, type: "LINK", uploadedByMemberId: A.member },
    });
    expect(ev.id).toBeTruthy();
    await prisma.evidence.delete({ where: { id: ev.id } });
  });

  it("Evidence cross-workspace task: 실패", async () => {
    await expect(
      prisma.evidence.create({
        data: { workspaceId: B.ws, taskId: taskA.id, type: "LINK", uploadedByMemberId: B.member },
      }),
    ).rejects.toThrow();
  });

  it("Evidence cross-workspace uploader: 실패", async () => {
    await expect(
      prisma.evidence.create({
        data: { workspaceId: A.ws, taskId: taskA.id, type: "LINK", uploadedByMemberId: B.member },
      }),
    ).rejects.toThrow();
  });

  it("TaskApproval MVP: Task 당 1개 (UNIQUE)", async () => {
    const a1 = await prisma.taskApproval.create({
      data: { workspaceId: A.ws, taskId: taskA.id },
    });
    expect(a1.id).toBeTruthy();
    await expect(
      prisma.taskApproval.create({ data: { workspaceId: A.ws, taskId: taskA.id } }),
    ).rejects.toThrow();
    await prisma.taskApproval.delete({ where: { id: a1.id } });
  });

  it("TaskApproval cross-workspace reviewer: 실패", async () => {
    await expect(
      prisma.taskApproval.create({
        data: { workspaceId: A.ws, taskId: taskA.id, reviewerMemberId: B.member },
      }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
describe("InternalPolicy + Version + LegalPolicyMapping cross-workspace", () => {
  let policyA: { id: string };
  let contentUnit: { id: string; documentId: string };

  beforeAll(async () => {
    policyA = await prisma.internalPolicy.create({
      data: { workspaceId: A.ws, type: "REGULATION", title: `${TEST_PREFIX}policy_A` },
    });
    const cu = await prisma.legalContentUnit.findFirst({ select: { id: true, documentId: true } });
    if (!cu) throw new Error("prerequisite: LegalContentUnit");
    contentUnit = cu;
  });

  afterAll(async () => {
    await prisma.internalPolicy.deleteMany({ where: { id: policyA.id } });
  });

  it("InternalPolicy same-workspace department: OK", async () => {
    const p = await prisma.internalPolicy.create({
      data: { workspaceId: A.ws, type: "SOP", title: `${TEST_PREFIX}sop_ok`, ownerDepartmentId: A.dept },
    });
    expect(p.ownerDepartmentId).toBe(A.dept);
    await prisma.internalPolicy.delete({ where: { id: p.id } });
  });

  it("InternalPolicy cross-workspace department: 실패", async () => {
    await expect(
      prisma.internalPolicy.create({
        data: { workspaceId: A.ws, type: "SOP", title: `${TEST_PREFIX}sop_bad`, ownerDepartmentId: B.dept },
      }),
    ).rejects.toThrow();
  });

  it("InternalPolicyVersion same-workspace creator: OK", async () => {
    const v = await prisma.internalPolicyVersion.create({
      data: { workspaceId: A.ws, policyId: policyA.id, versionLabel: "v1", createdByMemberId: A.member },
    });
    expect(v.id).toBeTruthy();
    await prisma.internalPolicyVersion.delete({ where: { id: v.id } });
  });

  it("InternalPolicyVersion cross-workspace creator: 실패", async () => {
    await expect(
      prisma.internalPolicyVersion.create({
        data: { workspaceId: A.ws, policyId: policyA.id, versionLabel: "vbad", createdByMemberId: B.member },
      }),
    ).rejects.toThrow();
  });

  it("InternalPolicyVersion cross-workspace policy: 실패", async () => {
    await expect(
      prisma.internalPolicyVersion.create({
        data: { workspaceId: B.ws, policyId: policyA.id, versionLabel: "vbad" },
      }),
    ).rejects.toThrow();
  });

  it("LegalPolicyMapping same-workspace + same document contentUnit: OK", async () => {
    const m = await prisma.legalPolicyMapping.create({
      data: {
        workspaceId: A.ws,
        policyId: policyA.id,
        documentId: contentUnit.documentId,
        contentUnitId: contentUnit.id,
        createdByMemberId: A.member,
      },
    });
    expect(m.id).toBeTruthy();
    await prisma.legalPolicyMapping.delete({ where: { id: m.id } });
  });

  it("LegalPolicyMapping cross-workspace policy: 실패", async () => {
    await expect(
      prisma.legalPolicyMapping.create({
        data: {
          workspaceId: B.ws,
          policyId: policyA.id,
          documentId: contentUnit.documentId,
          createdByMemberId: B.member,
        },
      }),
    ).rejects.toThrow();
  });

  it("LegalPolicyMapping cross-workspace creator: 실패", async () => {
    await expect(
      prisma.legalPolicyMapping.create({
        data: {
          workspaceId: A.ws,
          policyId: policyA.id,
          documentId: contentUnit.documentId,
          createdByMemberId: B.member,
        },
      }),
    ).rejects.toThrow();
  });

  it("LegalPolicyMapping cross-document contentUnit: 실패", async () => {
    // 다른 문서의 조문 하나 찾기
    const otherCu = await prisma.legalContentUnit.findFirst({
      where: { documentId: { not: contentUnit.documentId } },
      select: { id: true, documentId: true },
    });
    if (!otherCu) return; // 문서 2개 이상 없으면 skip
    await expect(
      prisma.legalPolicyMapping.create({
        data: {
          workspaceId: A.ws,
          policyId: policyA.id,
          documentId: contentUnit.documentId, // 이 문서
          contentUnitId: otherCu.id,          // ← 다른 문서의 조문
          createdByMemberId: A.member,
        },
      }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
describe("WatchContentScope: 실 FK + 같은 document 강제", () => {
  let watchA: { id: string; documentId: string };
  let sameDocCu: { id: string };
  let otherDocCu: { id: string; documentId: string } | null;

  beforeAll(async () => {
    const cu = await prisma.legalContentUnit.findFirst({ select: { id: true, documentId: true } });
    sameDocCu = cu!;
    watchA = (await prisma.watch.create({
      data: { workspaceId: A.ws, documentId: cu!.documentId, createdByMemberId: A.member },
    })) as { id: string; documentId: string };
    otherDocCu = await prisma.legalContentUnit.findFirst({
      where: { documentId: { not: cu!.documentId } },
      select: { id: true, documentId: true },
    });
  });

  afterAll(async () => {
    await prisma.watch.deleteMany({ where: { id: watchA.id } });
  });

  it("실제 LegalContentUnit + same document: OK", async () => {
    const scope = await prisma.watchContentScope.create({
      data: {
        workspaceId: A.ws,
        documentId: watchA.documentId,
        watchId: watchA.id,
        contentUnitId: sameDocCu.id,
      },
    });
    expect(scope.id).toBeTruthy();
    await prisma.watchContentScope.delete({ where: { id: scope.id } });
  });

  it("존재하지 않는 contentUnit: 실패", async () => {
    await expect(
      prisma.watchContentScope.create({
        data: {
          workspaceId: A.ws,
          documentId: watchA.documentId,
          watchId: watchA.id,
          contentUnitId: "does_not_exist_zzz",
        },
      }),
    ).rejects.toThrow();
  });

  it("Watch.document 과 다른 문서의 ContentUnit: 실패", async () => {
    if (!otherDocCu) return;
    await expect(
      prisma.watchContentScope.create({
        data: {
          workspaceId: A.ws,
          documentId: watchA.documentId,
          watchId: watchA.id,
          contentUnitId: otherDocCu.id, // 다른 documentId 의 조문
        },
      }),
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Round 4.6 추가 — Note / Reminder / AuditLog / Notification
// ═══════════════════════════════════════════════════════════════

describe("DocumentNote cross-workspace author 차단", () => {
  it("same-workspace author: 성공", async () => {
    const n = await prisma.documentNote.create({
      data: { workspaceId: A.ws, documentId: doc.id, authorMemberId: A.member, content: "n1" },
    });
    expect(n.id).toBeTruthy();
    await prisma.documentNote.delete({ where: { id: n.id } });
  });

  it("cross-workspace author: 실패", async () => {
    await expect(
      prisma.documentNote.create({
        data: { workspaceId: A.ws, documentId: doc.id, authorMemberId: B.member, content: "bad" },
      }),
    ).rejects.toThrow();
  });
});

describe("InboxNote cross-workspace 차단", () => {
  let inboxA: { id: string };
  beforeAll(async () => {
    const e = await prisma.legalChangeEvent.findFirst({ select: { id: true } });
    inboxA = await prisma.changeInboxItem.create({
      data: { workspaceId: A.ws, changeEventId: e!.id },
    });
  });
  afterAll(async () => {
    await prisma.changeInboxItem.deleteMany({ where: { id: inboxA.id } });
  });

  it("same-workspace inbox + author: 성공", async () => {
    const n = await prisma.inboxNote.create({
      data: { workspaceId: A.ws, inboxItemId: inboxA.id, authorMemberId: A.member, content: "ok" },
    });
    expect(n.id).toBeTruthy();
    await prisma.inboxNote.delete({ where: { id: n.id } });
  });

  it("cross-workspace inbox: 실패", async () => {
    await expect(
      prisma.inboxNote.create({
        data: { workspaceId: B.ws, inboxItemId: inboxA.id, authorMemberId: B.member, content: "bad" },
      }),
    ).rejects.toThrow();
  });

  it("cross-workspace author: 실패", async () => {
    await expect(
      prisma.inboxNote.create({
        data: { workspaceId: A.ws, inboxItemId: inboxA.id, authorMemberId: B.member, content: "bad" },
      }),
    ).rejects.toThrow();
  });
});

describe("Reminder cross-workspace + target XOR 강제", () => {
  let inboxA: { id: string };
  let taskA: { id: string };
  beforeAll(async () => {
    const e = await prisma.legalChangeEvent.findFirst({ select: { id: true } });
    inboxA = await prisma.changeInboxItem.create({
      data: { workspaceId: A.ws, changeEventId: e!.id },
    });
    taskA = await prisma.task.create({
      data: { workspaceId: A.ws, title: "t_reminder", createdByMemberId: A.member },
    });
  });
  afterAll(async () => {
    await prisma.task.deleteMany({ where: { id: taskA.id } });
    await prisma.changeInboxItem.deleteMany({ where: { id: inboxA.id } });
  });

  it("same-workspace inbox reminder: 성공", async () => {
    const r = await prisma.reminder.create({
      data: {
        workspaceId: A.ws,
        recipientMemberId: A.member,
        inboxItemId: inboxA.id,
        remindAt: new Date(Date.now() + 60_000),
      },
    });
    expect(r.id).toBeTruthy();
    await prisma.reminder.delete({ where: { id: r.id } });
  });

  it("same-workspace task reminder: 성공", async () => {
    const r = await prisma.reminder.create({
      data: {
        workspaceId: A.ws,
        recipientMemberId: A.member,
        taskId: taskA.id,
        remindAt: new Date(Date.now() + 60_000),
      },
    });
    expect(r.id).toBeTruthy();
    await prisma.reminder.delete({ where: { id: r.id } });
  });

  it("cross-workspace recipient: 실패", async () => {
    await expect(
      prisma.reminder.create({
        data: {
          workspaceId: A.ws,
          recipientMemberId: B.member,
          taskId: taskA.id,
          remindAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });

  it("cross-workspace inbox: 실패", async () => {
    await expect(
      prisma.reminder.create({
        data: {
          workspaceId: B.ws,
          recipientMemberId: B.member,
          inboxItemId: inboxA.id,
          remindAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });

  it("cross-workspace task: 실패", async () => {
    await expect(
      prisma.reminder.create({
        data: {
          workspaceId: B.ws,
          recipientMemberId: B.member,
          taskId: taskA.id,
          remindAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });

  it("target 0개 (inbox+task 모두 null): CHECK 위반으로 실패", async () => {
    await expect(
      prisma.reminder.create({
        data: {
          workspaceId: A.ws,
          recipientMemberId: A.member,
          remindAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });

  it("target 2개 (inbox+task 동시): CHECK 위반으로 실패", async () => {
    await expect(
      prisma.reminder.create({
        data: {
          workspaceId: A.ws,
          recipientMemberId: A.member,
          inboxItemId: inboxA.id,
          taskId: taskA.id,
          remindAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("WorkspaceAuditLog actor cross-workspace 차단", () => {
  it("same-workspace actor: 성공", async () => {
    const log = await prisma.workspaceAuditLog.create({
      data: {
        workspaceId: A.ws,
        actorMemberId: A.member,
        action: "TEST_ACTION",
        entityType: "Watch",
        entityId: "e1",
      },
    });
    expect(log.id).toBeTruthy();
    await prisma.workspaceAuditLog.delete({ where: { id: log.id } });
  });

  it("null actor (시스템 action): 성공", async () => {
    const log = await prisma.workspaceAuditLog.create({
      data: {
        workspaceId: A.ws,
        action: "SYSTEM_ACTION",
        entityType: "Task",
        entityId: "e2",
      },
    });
    expect(log.id).toBeTruthy();
    await prisma.workspaceAuditLog.delete({ where: { id: log.id } });
  });

  it("cross-workspace actor: 실패", async () => {
    await expect(
      prisma.workspaceAuditLog.create({
        data: {
          workspaceId: A.ws,
          actorMemberId: B.member,
          action: "BAD",
          entityType: "x",
          entityId: "y",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("Notification recipient + inbox/task cross-workspace 차단", () => {
  let inboxA: { id: string };
  let taskA: { id: string };
  beforeAll(async () => {
    const e = await prisma.legalChangeEvent.findFirst({ select: { id: true } });
    inboxA = await prisma.changeInboxItem.create({
      data: { workspaceId: A.ws, changeEventId: e!.id },
    });
    taskA = await prisma.task.create({
      data: { workspaceId: A.ws, title: "t_notif", createdByMemberId: A.member },
    });
  });
  afterAll(async () => {
    await prisma.task.deleteMany({ where: { id: taskA.id } });
    await prisma.changeInboxItem.deleteMany({ where: { id: inboxA.id } });
  });

  it("same-workspace recipient + inbox + task: 성공", async () => {
    const n = await prisma.notification.create({
      data: {
        workspaceId: A.ws,
        recipientMemberId: A.member,
        kind: "CHANGE_DETECTED",
        title: "t",
        body: "b",
        inboxItemId: inboxA.id,
        taskId: taskA.id,
      },
    });
    expect(n.id).toBeTruthy();
    await prisma.notification.delete({ where: { id: n.id } });
  });

  it("cross-workspace recipient: 실패", async () => {
    await expect(
      prisma.notification.create({
        data: {
          workspaceId: A.ws,
          recipientMemberId: B.member,
          kind: "SYSTEM",
          title: "t",
          body: "b",
        },
      }),
    ).rejects.toThrow();
  });

  it("cross-workspace inbox: 실패", async () => {
    await expect(
      prisma.notification.create({
        data: {
          workspaceId: B.ws,
          recipientMemberId: B.member,
          kind: "SYSTEM",
          title: "t",
          body: "b",
          inboxItemId: inboxA.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("cross-workspace task: 실패", async () => {
    await expect(
      prisma.notification.create({
        data: {
          workspaceId: B.ws,
          recipientMemberId: B.member,
          kind: "SYSTEM",
          title: "t",
          body: "b",
          taskId: taskA.id,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("LegalAttachment cross-document 차단", () => {
  it("same document (version + optional contentUnit): 성공", async () => {
    const ver = await prisma.legalDocumentVersion.findFirst({ select: { id: true, documentId: true } });
    if (!ver) return;
    const cu = await prisma.legalContentUnit.findFirst({
      where: { documentId: ver.documentId },
      select: { id: true },
    });
    const att = await prisma.legalAttachment.create({
      data: {
        documentId: ver.documentId,
        documentVersionId: ver.id,
        contentUnitId: cu?.id,
        attachmentType: "FILE",
        fileName: "test.pdf",
      },
    });
    expect(att.id).toBeTruthy();
    await prisma.legalAttachment.delete({ where: { id: att.id } });
  });

  it("cross-document contentUnit (documentVersion=A, contentUnit=B): 실패", async () => {
    const verA = await prisma.legalDocumentVersion.findFirst({ select: { id: true, documentId: true } });
    if (!verA) return;
    const cuB = await prisma.legalContentUnit.findFirst({
      where: { documentId: { not: verA.documentId } },
      select: { id: true, documentId: true },
    });
    if (!cuB) return;
    await expect(
      prisma.legalAttachment.create({
        data: {
          documentId: verA.documentId,
          documentVersionId: verA.id,
          contentUnitId: cuB.id, // 다른 문서의 조문
          attachmentType: "FILE",
        },
      }),
    ).rejects.toThrow();
  });
});
