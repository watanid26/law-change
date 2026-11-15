// Integration test: Historical Data Retention (Round 4.7)
//
// 핵심 원칙: "사람이 떠나도 조직의 판단·조치·증빙·감사 기록은 남는다."
//
// 각 relation:
//   - Historical (creator/author/uploader/actor): member 삭제 → row 유지, FK NULL
//   - Assignment (assignee/owner/recipient): member 삭제 → row 유지, FK NULL
//   - AppUser hard-delete: 어떤 workspace membership 이라도 있으면 NoAction 으로 차단
//   - WorkspaceInvitation: cross-workspace inviter 불가 (composite FK)

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_RETENTION_";

interface Fixture {
  user: string;
  ws: string;
  member: string;      // main creator/author
  extraMember: string; // 두 번째 멤버 — creator 삭제 후에도 workspace 는 살아있게
  dept: string;
  policy: string;
  doc: string;
  cu: string;
  event: string;
}

async function makeFixture(): Promise<Fixture> {
  const suffix = `${TEST_PREFIX}${randomUUID().slice(0, 8)}`;
  const [user, extraUser] = await Promise.all([
    prisma.appUser.create({ data: { email: `${suffix}_creator@t.local` } }),
    prisma.appUser.create({ data: { email: `${suffix}_admin@t.local` } }),
  ]);
  const ws = await prisma.workspace.create({
    data: { type: "TEAM", name: `WS_${suffix}` },
  });
  const [member, extraMember] = await Promise.all([
    prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: user.id, role: "MEMBER" },
    }),
    prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: extraUser.id, role: "OWNER" },
    }),
  ]);
  const dept = await prisma.department.create({
    data: { workspaceId: ws.id, name: `Dept_${suffix}` },
  });
  const policy = await prisma.internalPolicy.create({
    data: { workspaceId: ws.id, type: "REGULATION", title: `Policy_${suffix}` },
  });
  const legalDoc = await prisma.legalDocument.findFirst({ select: { id: true } });
  const cu = await prisma.legalContentUnit.findFirst({
    where: { documentId: legalDoc!.id },
    select: { id: true },
  });
  const event = await prisma.legalChangeEvent.findFirst({ select: { id: true } });
  return {
    user: user.id, ws: ws.id, member: member.id, extraMember: extraMember.id,
    dept: dept.id, policy: policy.id, doc: legalDoc!.id, cu: cu!.id, event: event!.id,
  };
}

async function cleanup(f?: Fixture) {
  await prisma.workspace.deleteMany({ where: { name: { startsWith: `WS_${TEST_PREFIX}` } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ────────────────────────────────────────────────────────────────
describe("Historical retention — WorkspaceMember 삭제 후 조직 기록 보존", () => {
  it("Task creator 삭제 → Task 유지 + createdByMemberId NULL", async () => {
    const f = await makeFixture();
    const inbox = await prisma.changeInboxItem.create({
      data: { workspaceId: f.ws, changeEventId: f.event },
    });
    const task = await prisma.task.create({
      data: {
        workspaceId: f.ws, title: "T",
        inboxItemId: inbox.id,
        createdByMemberId: f.member,
        assigneeMemberId: f.member,
        ownerDepartmentId: f.dept,
      },
    });
    // creator 삭제
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.task.findUnique({ where: { id: task.id } });
    expect(after).not.toBeNull();
    expect(after!.createdByMemberId).toBeNull();
    expect(after!.assigneeMemberId).toBeNull(); // assignment 도 SET NULL
    expect(after!.ownerDepartmentId).toBe(f.dept); // department 는 사람이 아님, 유지
    expect(after!.title).toBe("T");
    expect(after!.inboxItemId).toBe(inbox.id);
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("Evidence uploader 삭제 → Evidence 유지 + uploader NULL", async () => {
    const f = await makeFixture();
    const task = await prisma.task.create({
      data: { workspaceId: f.ws, title: "T_ev", createdByMemberId: f.extraMember },
    });
    const evid = await prisma.evidence.create({
      data: {
        workspaceId: f.ws, taskId: task.id, type: "LINK",
        externalUrl: "https://audit.example",
        uploadedByMemberId: f.member,
      },
    });
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.evidence.findUnique({ where: { id: evid.id } });
    expect(after).not.toBeNull();
    expect(after!.uploadedByMemberId).toBeNull();
    expect(after!.type).toBe("LINK");
    expect(after!.externalUrl).toBe("https://audit.example");
    expect(after!.taskId).toBe(task.id);
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("DocumentNote author 삭제 → Note 유지 + author NULL", async () => {
    const f = await makeFixture();
    const note = await prisma.documentNote.create({
      data: { workspaceId: f.ws, documentId: f.doc, authorMemberId: f.member, content: "판단 근거" },
    });
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.documentNote.findUnique({ where: { id: note.id } });
    expect(after).not.toBeNull();
    expect(after!.authorMemberId).toBeNull();
    expect(after!.content).toBe("판단 근거");
    expect(after!.documentId).toBe(f.doc);
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("InboxNote author 삭제 → Note 유지 + author NULL", async () => {
    const f = await makeFixture();
    const inbox = await prisma.changeInboxItem.create({
      data: { workspaceId: f.ws, changeEventId: f.event },
    });
    const note = await prisma.inboxNote.create({
      data: { workspaceId: f.ws, inboxItemId: inbox.id, authorMemberId: f.member, content: "검토 의견" },
    });
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.inboxNote.findUnique({ where: { id: note.id } });
    expect(after).not.toBeNull();
    expect(after!.authorMemberId).toBeNull();
    expect(after!.content).toBe("검토 의견");
    expect(after!.inboxItemId).toBe(inbox.id);
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("Watch creator 삭제 → Watch 유지 (owner 도 NULL, 문서 관계 유지)", async () => {
    const f = await makeFixture();
    const watch = await prisma.watch.create({
      data: {
        workspaceId: f.ws, documentId: f.doc,
        createdByMemberId: f.member,
        ownerMemberId: f.member,
        ownerDepartmentId: f.dept,
        applicabilityStatus: "APPLICABLE",
      },
    });
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.watch.findUnique({ where: { id: watch.id } });
    expect(after).not.toBeNull();
    expect(after!.createdByMemberId).toBeNull();
    expect(after!.ownerMemberId).toBeNull();
    expect(after!.ownerDepartmentId).toBe(f.dept);
    expect(after!.documentId).toBe(f.doc);
    expect(after!.applicabilityStatus).toBe("APPLICABLE");
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("LegalPolicyMapping creator 삭제 → Mapping 유지 + creator NULL", async () => {
    const f = await makeFixture();
    const m = await prisma.legalPolicyMapping.create({
      data: {
        workspaceId: f.ws,
        documentId: f.doc,
        contentUnitId: f.cu,
        policyId: f.policy,
        createdByMemberId: f.member,
      },
    });
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.legalPolicyMapping.findUnique({ where: { id: m.id } });
    expect(after).not.toBeNull();
    expect(after!.createdByMemberId).toBeNull();
    expect(after!.policyId).toBe(f.policy);
    expect(after!.contentUnitId).toBe(f.cu);
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("InternalPolicyVersion creator 삭제 → version 유지 + creator NULL", async () => {
    const f = await makeFixture();
    const v = await prisma.internalPolicyVersion.create({
      data: {
        workspaceId: f.ws, policyId: f.policy,
        versionLabel: "v1", createdByMemberId: f.member,
      },
    });
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.internalPolicyVersion.findUnique({ where: { id: v.id } });
    expect(after).not.toBeNull();
    expect(after!.createdByMemberId).toBeNull();
    expect(after!.versionLabel).toBe("v1");
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("TaskApproval reviewer/approver 삭제 → approval 유지 + 각 FK NULL", async () => {
    const f = await makeFixture();
    const task = await prisma.task.create({
      data: { workspaceId: f.ws, title: "T_appr", createdByMemberId: f.extraMember },
    });
    const appr = await prisma.taskApproval.create({
      data: {
        workspaceId: f.ws, taskId: task.id,
        reviewerMemberId: f.member,
        approverMemberId: f.member,
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.taskApproval.findUnique({ where: { id: appr.id } });
    expect(after).not.toBeNull();
    expect(after!.reviewerMemberId).toBeNull();
    expect(after!.approverMemberId).toBeNull();
    expect(after!.status).toBe("APPROVED");
    expect(after!.approvedAt).not.toBeNull();
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("WorkspaceAuditLog actor 삭제 → log 유지 + actor NULL", async () => {
    const f = await makeFixture();
    const log = await prisma.workspaceAuditLog.create({
      data: {
        workspaceId: f.ws, actorMemberId: f.member,
        action: "APPROVE_INBOX", entityType: "ChangeInboxItem", entityId: "e1",
        metadata: { note: "감사기록" },
      },
    });
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.workspaceAuditLog.findUnique({ where: { id: log.id } });
    expect(after).not.toBeNull();
    expect(after!.actorMemberId).toBeNull();
    expect(after!.action).toBe("APPROVE_INBOX");
    expect(after!.entityId).toBe("e1");
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("ChangeInboxItem assignee 삭제 → Inbox 유지 + assignee NULL", async () => {
    const f = await makeFixture();
    const inbox = await prisma.changeInboxItem.create({
      data: {
        workspaceId: f.ws, changeEventId: f.event,
        assignedToMemberId: f.member,
        ownerDepartmentId: f.dept,
      },
    });
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.changeInboxItem.findUnique({ where: { id: inbox.id } });
    expect(after).not.toBeNull();
    expect(after!.assignedToMemberId).toBeNull();
    expect(after!.ownerDepartmentId).toBe(f.dept);
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("Notification 은 CASCADE 정책 (개인 알림 삭제): recipient 삭제 → notification 도 삭제", async () => {
    // 정책 문서화: personal delivery object 는 audit 대상 아님 (schema.prisma 주석 §7).
    const f = await makeFixture();
    const n = await prisma.notification.create({
      data: {
        workspaceId: f.ws, recipientMemberId: f.member,
        kind: "REMINDER", title: "알림", body: "본문",
      },
    });
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    const after = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(after).toBeNull(); // 의도된 CASCADE
    await prisma.workspace.delete({ where: { id: f.ws } });
  });
});

// ────────────────────────────────────────────────────────────────
describe("AppUser hard-delete 방어 (NO ACTION)", () => {
  it("workspace membership 이 있으면 AppUser hard-delete 는 실패", async () => {
    const f = await makeFixture();
    await expect(
      prisma.appUser.delete({ where: { id: f.user } }),
    ).rejects.toThrow(); // WorkspaceMember FK NO ACTION 위반
    // membership 아직 존재 확인
    const stillMember = await prisma.workspaceMember.findUnique({ where: { id: f.member } });
    expect(stillMember).not.toBeNull();
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("orphan AppUser (membership 없음) 만 hard-delete 가능", async () => {
    const suffix = `${TEST_PREFIX}${randomUUID().slice(0, 8)}`;
    const user = await prisma.appUser.create({ data: { email: `${suffix}_orphan@t.local` } });
    // membership 만들지 않음
    await expect(prisma.appUser.delete({ where: { id: user.id } })).resolves.not.toThrow();
  });

  it("정책 시나리오: membership hard-delete 후 AppUser 삭제 가능해짐", async () => {
    const f = await makeFixture();
    // 1) 두 membership 모두 삭제 (실 서비스에선 status 전환이지만 hard-delete 도 지원)
    await prisma.workspaceMember.delete({ where: { id: f.member } });
    await prisma.workspaceMember.delete({ where: { id: f.extraMember } });
    // 2) AppUser 삭제 가능
    await expect(prisma.appUser.delete({ where: { id: f.user } })).resolves.not.toThrow();
    await prisma.workspace.delete({ where: { id: f.ws } });
  });
});

// ────────────────────────────────────────────────────────────────
describe("WorkspaceInvitation identity (v12): composite tenant FK", () => {
  it("same-workspace inviter: 성공", async () => {
    const f = await makeFixture();
    const inv = await prisma.workspaceInvitation.create({
      data: {
        workspaceId: f.ws, email: "new@t.local", role: "MEMBER",
        tokenHash: `tok_${randomUUID()}`,
        invitedByMemberId: f.extraMember,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    expect(inv.invitedByMemberId).toBe(f.extraMember);
    await prisma.workspaceInvitation.delete({ where: { id: inv.id } });
    await prisma.workspace.delete({ where: { id: f.ws } });
  });

  it("cross-workspace inviter: 실패 (composite FK 위반)", async () => {
    const [f1, f2] = await Promise.all([makeFixture(), makeFixture()]);
    await expect(
      prisma.workspaceInvitation.create({
        data: {
          workspaceId: f1.ws, email: "hijack@t.local", role: "MEMBER",
          tokenHash: `tok_${randomUUID()}`,
          invitedByMemberId: f2.extraMember, // 다른 workspace 의 멤버
          expiresAt: new Date(Date.now() + 86400_000),
        },
      }),
    ).rejects.toThrow();
    await prisma.workspace.deleteMany({ where: { id: { in: [f1.ws, f2.ws] } } });
  });

  it("inviter 삭제 → invitation 유지 + inviter NULL (SET NULL 정책)", async () => {
    const f = await makeFixture();
    const inv = await prisma.workspaceInvitation.create({
      data: {
        workspaceId: f.ws, email: "keeprecord@t.local", role: "MEMBER",
        tokenHash: `tok_${randomUUID()}`,
        invitedByMemberId: f.extraMember,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    await prisma.workspaceMember.delete({ where: { id: f.extraMember } });
    const after = await prisma.workspaceInvitation.findUnique({ where: { id: inv.id } });
    expect(after).not.toBeNull();
    expect(after!.invitedByMemberId).toBeNull();
    expect(after!.email).toBe("keeprecord@t.local");
    await prisma.workspace.delete({ where: { id: f.ws } });
  });
});

// ────────────────────────────────────────────────────────────────
describe("Cascade chain 스모크: member 삭제 후 조직 이력 count 보존", () => {
  it("Watch + Inbox + Task + Evidence + Notes + Mapping + Approval + Audit 모두 유지", async () => {
    const f = await makeFixture();
    // 다양한 historical 데이터를 member 로 생성
    const [watch, inbox] = await Promise.all([
      prisma.watch.create({
        data: { workspaceId: f.ws, documentId: f.doc, createdByMemberId: f.member },
      }),
      prisma.changeInboxItem.create({
        data: { workspaceId: f.ws, changeEventId: f.event, assignedToMemberId: f.member },
      }),
    ]);
    const task = await prisma.task.create({
      data: { workspaceId: f.ws, title: "T_chain", inboxItemId: inbox.id, createdByMemberId: f.member },
    });
    await Promise.all([
      prisma.evidence.create({
        data: { workspaceId: f.ws, taskId: task.id, type: "FILE", uploadedByMemberId: f.member },
      }),
      prisma.documentNote.create({
        data: { workspaceId: f.ws, documentId: f.doc, authorMemberId: f.member, content: "x" },
      }),
      prisma.inboxNote.create({
        data: { workspaceId: f.ws, inboxItemId: inbox.id, authorMemberId: f.member, content: "y" },
      }),
      prisma.legalPolicyMapping.create({
        data: {
          workspaceId: f.ws, documentId: f.doc, policyId: f.policy,
          createdByMemberId: f.member,
        },
      }),
      prisma.taskApproval.create({
        data: { workspaceId: f.ws, taskId: task.id, reviewerMemberId: f.member },
      }),
      prisma.workspaceAuditLog.create({
        data: {
          workspaceId: f.ws, actorMemberId: f.member,
          action: "TEST", entityType: "Task", entityId: task.id,
        },
      }),
    ]);

    const wsFilter = { where: { workspaceId: f.ws } };
    const [wCount, iCount, tCount, eCount, dnCount, inCount, lpmCount, taCount, wallCount] = await Promise.all([
      prisma.watch.count(wsFilter),
      prisma.changeInboxItem.count(wsFilter),
      prisma.task.count(wsFilter),
      prisma.evidence.count(wsFilter),
      prisma.documentNote.count(wsFilter),
      prisma.inboxNote.count(wsFilter),
      prisma.legalPolicyMapping.count(wsFilter),
      prisma.taskApproval.count(wsFilter),
      prisma.workspaceAuditLog.count(wsFilter),
    ]);

    // member 삭제
    await prisma.workspaceMember.delete({ where: { id: f.member } });

    // 삭제 후 count 동일해야 (모두 SET NULL로 살아남음)
    const [wCount2, iCount2, tCount2, eCount2, dnCount2, inCount2, lpmCount2, taCount2, wallCount2] = await Promise.all([
      prisma.watch.count(wsFilter),
      prisma.changeInboxItem.count(wsFilter),
      prisma.task.count(wsFilter),
      prisma.evidence.count(wsFilter),
      prisma.documentNote.count(wsFilter),
      prisma.inboxNote.count(wsFilter),
      prisma.legalPolicyMapping.count(wsFilter),
      prisma.taskApproval.count(wsFilter),
      prisma.workspaceAuditLog.count(wsFilter),
    ]);
    expect({ wCount: wCount2, iCount: iCount2, tCount: tCount2, eCount: eCount2, dnCount: dnCount2, inCount: inCount2, lpmCount: lpmCount2, taCount: taCount2, wallCount: wallCount2 }).toEqual(
      { wCount, iCount, tCount, eCount, dnCount, inCount, lpmCount, taCount, wallCount },
    );

    await prisma.workspace.delete({ where: { id: f.ws } });
  });
});
