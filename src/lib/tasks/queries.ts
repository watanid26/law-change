// Task 조회. workspaceId 스코프 필수.

import { prisma } from "@/lib/prisma";
import { TASK_OPEN_STATUSES } from "./labels";

export interface TaskListParams {
  workspaceId: string;
  status?: string;
  priority?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TaskListItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: Date | null;
  createdAt: Date;
  inboxItemId: string | null;
  inboxDocumentTitle: string | null;
  evidenceCount: number;
}

export async function listTasks(params: TaskListParams): Promise<{
  items: TaskListItem[];
  total: number;
}> {
  const limit = Math.min(params.limit ?? 50, 100);
  const offset = params.offset ?? 0;

  const where = {
    workspaceId: params.workspaceId,
    archivedAt: null,
    status: params.status ? params.status : { in: TASK_OPEN_STATUSES },
    ...(params.priority ? { priority: params.priority } : {}),
    ...(params.search
      ? { title: { contains: params.search, mode: "insensitive" as const } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueAt: true,
        createdAt: true,
        inboxItemId: true,
        inboxItem: {
          select: {
            changeEvent: { select: { document: { select: { currentTitle: true } } } },
          },
        },
        _count: { select: { evidence: { where: { deletedAt: null } } } },
      },
    }),
    prisma.task.count({ where }),
  ]);

  const items = rows.map<TaskListItem>((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueAt: r.dueAt,
    createdAt: r.createdAt,
    inboxItemId: r.inboxItemId,
    inboxDocumentTitle: r.inboxItem?.changeEvent.document.currentTitle ?? null,
    evidenceCount: r._count.evidence,
  }));

  return { items, total };
}

export async function getTaskDetail(workspaceId: string, taskId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    include: {
      inboxItem: {
        select: {
          id: true,
          status: true,
          changeEvent: {
            select: {
              id: true,
              document: {
                select: {
                  id: true,
                  currentTitle: true,
                  externalDocumentId: true,
                  documentType: true,
                },
              },
            },
          },
        },
      },
      evidence: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          externalUrl: true,
          fileReference: true,
          description: true,
          createdAt: true,
          uploadedByMember: { select: { user: { select: { displayName: true, email: true } } } },
        },
      },
    },
  });
}

export async function countOpenTasks(workspaceId: string): Promise<number> {
  return prisma.task.count({
    where: {
      workspaceId,
      archivedAt: null,
      status: { in: TASK_OPEN_STATUSES },
    },
  });
}
