// Task / Evidence 도메인 서비스 (개인 사용 전용).
//
// 원칙:
// - 개인 Workspace 이므로 assignee = 항상 자기 자신 (auto). 별도 선택 UI 없음.
// - createdByMember 는 nullable (R4.7 historical retention 정책).
// - Inbox 로부터 Task 생성 시 ownerDepartment 는 Inbox 로부터 상속.
// - Cross-workspace 결합 = 0 (composite FK + service assert).
// - IDOR = workspace-scoped findFirst → NOT_FOUND.
// - 모든 mutation 은 audit 와 같은 transaction.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AddEvidenceInput,
  CreateStandaloneTaskInput,
  CreateTaskFromInboxInput,
  UpdateTaskInput,
} from "./validation";
import {
  TASK_CLOSED_STATUSES,
  TASK_OPEN_STATUSES,
  type TaskStatus,
} from "./labels";

export class TaskServiceError extends Error {
  code: "TASK_NOT_FOUND" | "INBOX_NOT_FOUND" | "EVIDENCE_NOT_FOUND" | "INVALID_TRANSITION";
  constructor(code: TaskServiceError["code"], message?: string) {
    super(message ?? code);
    this.name = "TaskServiceError";
    this.code = code;
  }
}

export interface TaskContext {
  workspaceId: string;
  memberId: string;
}

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

// Inbox 로부터 Task 생성 — Inbox 는 반드시 같은 workspace, dept/priority 상속.
export async function createTaskFromInbox(
  ctx: TaskContext,
  input: CreateTaskFromInboxInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const inbox = await tx.changeInboxItem.findFirst({
      where: { id: input.inboxItemId, workspaceId: ctx.workspaceId },
      select: { id: true, ownerDepartmentId: true, priority: true, status: true },
    });
    if (!inbox) throw new TaskServiceError("INBOX_NOT_FOUND");

    const task = await tx.task.create({
      data: {
        workspaceId: ctx.workspaceId,
        inboxItemId: inbox.id,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? inbox.priority ?? "NORMAL",
        status: "TODO",
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        ownerDepartmentId: inbox.ownerDepartmentId,
        assigneeMemberId: ctx.memberId, // 개인 사용: 항상 본인
        createdByMemberId: ctx.memberId,
      },
      select: { id: true },
    });

    // Inbox 상태를 ACTION_REQUIRED 로 자동 승격 (REVIEWING 이거나 NEW 인 경우)
    if (inbox.status === "NEW" || inbox.status === "REVIEWING") {
      await tx.changeInboxItem.update({
        where: { id: inbox.id },
        data: { status: "ACTION_REQUIRED" },
      });
      await writeAudit(tx, ctx, "INBOX_TRANSITION", inbox.id, "ChangeInboxItem", {
        before: { status: inbox.status }, after: { status: "ACTION_REQUIRED", reason: "TASK_CREATED" },
      });
    }

    await writeAudit(tx, ctx, "TASK_CREATED", task.id, "Task", {
      after: { title: input.title, from: "inbox", inboxItemId: inbox.id },
    });
    return task;
  });
}

// 독립 Task (Inbox 없이 사용자 직접 생성).
// 라운드 19-C3: assigneeMemberId 옵션 지원 — 없으면 본인. 있으면 workspace 소속 검증.
export async function createStandaloneTask(
  ctx: TaskContext,
  input: CreateStandaloneTaskInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    let assigneeId = ctx.memberId;
    if (input.assigneeMemberId && input.assigneeMemberId !== ctx.memberId) {
      const m = await tx.workspaceMember.findFirst({
        where: { id: input.assigneeMemberId, workspaceId: ctx.workspaceId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!m) throw new TaskServiceError("TASK_NOT_FOUND"); // reuse code — cross-workspace = 404
      assigneeId = m.id;
    }
    const task = await tx.task.create({
      data: {
        workspaceId: ctx.workspaceId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "NORMAL",
        status: "TODO",
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        assigneeMemberId: assigneeId,
        createdByMemberId: ctx.memberId,
      },
      select: { id: true },
    });
    await writeAudit(tx, ctx, "TASK_CREATED", task.id, "Task", {
      after: { title: input.title, from: "standalone", assigneeMemberId: assigneeId },
    });
    return task;
  });
}

// ─────────────────────────────────────────────────────────────
// Update / transition
// ─────────────────────────────────────────────────────────────

export async function updateTask(
  ctx: TaskContext,
  taskId: string,
  input: UpdateTaskInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = await tx.task.findFirst({
      where: { id: taskId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!t) throw new TaskServiceError("TASK_NOT_FOUND");

    const data: Prisma.TaskUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.dueAt !== undefined) data.dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (Object.keys(data).length === 0) return;

    await tx.task.update({ where: { id: t.id }, data });
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) changed[k] = v;
    }
    await writeAudit(tx, ctx, "TASK_UPDATED", t.id, "Task", { after: changed });
  });
}

const VALID_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO:        ["IN_PROGRESS", "DONE", "CANCELLED"],
  IN_PROGRESS: ["TODO", "DONE", "CANCELLED"],
  DONE:        ["IN_PROGRESS"], // 재개
  CANCELLED:   ["TODO"],        // 재활성
};

export async function transitionTask(
  ctx: TaskContext,
  taskId: string,
  next: TaskStatus,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = await tx.task.findFirst({
      where: { id: taskId, workspaceId: ctx.workspaceId },
      select: { id: true, status: true, inboxItemId: true, startedAt: true, completedAt: true },
    });
    if (!t) throw new TaskServiceError("TASK_NOT_FOUND");
    if (t.status === next) return;

    const allowed = VALID_TASK_TRANSITIONS[t.status as TaskStatus] ?? [];
    if (!allowed.includes(next)) {
      throw new TaskServiceError("INVALID_TRANSITION", `${t.status} → ${next}`);
    }

    const now = new Date();
    const data: Prisma.TaskUpdateInput = { status: next };
    if (next === "IN_PROGRESS" && !t.startedAt) data.startedAt = now;
    if (next === "DONE") data.completedAt = now;
    if (!TASK_CLOSED_STATUSES.includes(next)) data.completedAt = null; // 재개 시 clear

    await tx.task.update({ where: { id: t.id }, data });
    await writeAudit(tx, ctx, "TASK_TRANSITION", t.id, "Task", {
      before: { status: t.status }, after: { status: next },
    });

    // Inbox 자동 승격/완료 로직 — 이 Task 가 Inbox 소속이면:
    // - Task 가 DONE 되면 이 Inbox 의 다른 열린 Task 가 없는지 확인 후 Inbox 도 DONE
    // - Task 가 다시 열리면 Inbox 도 ACTION_REQUIRED 로 복귀
    if (t.inboxItemId) {
      if (next === "DONE") {
        const openTasks = await tx.task.count({
          where: {
            inboxItemId: t.inboxItemId,
            status: { in: TASK_OPEN_STATUSES },
            id: { not: t.id },
          },
        });
        if (openTasks === 0) {
          const inbox = await tx.changeInboxItem.findUnique({
            where: { id: t.inboxItemId },
            select: { status: true },
          });
          if (inbox && !["DONE", "DISMISSED"].includes(inbox.status)) {
            await tx.changeInboxItem.update({
              where: { id: t.inboxItemId },
              data: { status: "DONE", completedAt: now },
            });
            await writeAudit(tx, ctx, "INBOX_TRANSITION", t.inboxItemId, "ChangeInboxItem", {
              before: { status: inbox.status }, after: { status: "DONE", reason: "ALL_TASKS_DONE" },
            });
          }
        }
      } else if (TASK_OPEN_STATUSES.includes(next)) {
        const inbox = await tx.changeInboxItem.findUnique({
          where: { id: t.inboxItemId },
          select: { status: true },
        });
        if (inbox && (inbox.status === "DONE" || inbox.status === "DISMISSED")) {
          await tx.changeInboxItem.update({
            where: { id: t.inboxItemId },
            data: { status: "ACTION_REQUIRED", completedAt: null, dismissedAt: null },
          });
          await writeAudit(tx, ctx, "INBOX_TRANSITION", t.inboxItemId, "ChangeInboxItem", {
            before: { status: inbox.status }, after: { status: "ACTION_REQUIRED", reason: "TASK_REOPENED" },
          });
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Evidence
// ─────────────────────────────────────────────────────────────

export async function addEvidence(
  ctx: TaskContext,
  taskId: string,
  input: AddEvidenceInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const t = await tx.task.findFirst({
      where: { id: taskId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!t) throw new TaskServiceError("TASK_NOT_FOUND");

    const ev = await tx.evidence.create({
      data: {
        workspaceId: ctx.workspaceId,
        taskId: t.id,
        type: input.type,
        externalUrl: input.externalUrl ?? null,
        fileReference: input.fileReference ?? null,
        description: input.description ?? null,
        uploadedByMemberId: ctx.memberId,
      },
      select: { id: true },
    });
    await writeAudit(tx, ctx, "EVIDENCE_ADDED", ev.id, "Evidence", {
      after: { taskId: t.id, type: input.type },
    });
    return ev;
  });
}

// Evidence soft delete (deletedAt 기록만).
export async function softDeleteEvidence(ctx: TaskContext, evidenceId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ev = await tx.evidence.findFirst({
      where: { id: evidenceId, workspaceId: ctx.workspaceId, deletedAt: null },
      select: { id: true, taskId: true, type: true },
    });
    if (!ev) throw new TaskServiceError("EVIDENCE_NOT_FOUND");
    await tx.evidence.update({ where: { id: ev.id }, data: { deletedAt: new Date() } });
    await writeAudit(tx, ctx, "EVIDENCE_DELETED", ev.id, "Evidence", {
      before: { taskId: ev.taskId, type: ev.type },
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function writeAudit(
  tx: Prisma.TransactionClient,
  ctx: TaskContext,
  action: string,
  entityId: string,
  entityType: "Task" | "Evidence" | "ChangeInboxItem",
  data: { before?: Record<string, unknown>; after?: Record<string, unknown> },
) {
  await tx.workspaceAuditLog.create({
    data: {
      workspaceId: ctx.workspaceId,
      actorMemberId: ctx.memberId,
      action,
      entityType,
      entityId,
      beforeData: (data.before ?? undefined) as Prisma.InputJsonValue | undefined,
      afterData: (data.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
