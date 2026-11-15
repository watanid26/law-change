// Regulatory Calendar 통합 조회.
// 하나의 항목 타입에 3가지 source 를 모아 표시:
//   - REVIEW: Watch.nextReviewAt (예정된 검토)
//   - EFFECTIVE: 관리 중 법령의 LegalChangeEvent.effectiveDate (시행일)
//   - TASK: Task.dueAt (업무 마감)

import { prisma } from "@/lib/prisma";
import { eventTypeLabel } from "@/lib/style";
import { TASK_PRIORITY_LABEL, type TaskPriority } from "@/lib/tasks/labels";

export type CalendarEventKind = "REVIEW" | "EFFECTIVE" | "TASK";

export interface CalendarEvent {
  kind: CalendarEventKind;
  date: Date;
  title: string;
  href: string;
  meta?: string;
}

// [from, to) 범위의 이벤트를 모아 반환. 프론트가 월 단위로 자른다.
export async function listCalendarEvents(params: {
  workspaceId: string;
  from: Date;
  to: Date;
}): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];

  // 1) Watch review 예정
  const reviewRows = await prisma.watch.findMany({
    where: {
      workspaceId: params.workspaceId,
      archivedAt: null,
      status: "ACTIVE",
      nextReviewAt: { gte: params.from, lt: params.to },
    },
    select: {
      id: true,
      nextReviewAt: true,
      document: { select: { currentTitle: true } },
    },
  });
  for (const r of reviewRows) {
    events.push({
      kind: "REVIEW",
      date: r.nextReviewAt!,
      title: r.document.currentTitle,
      href: `/app/watches/${r.id}`,
      meta: "검토 예정",
    });
  }

  // 2) 관리 중 법령의 시행일 (ChangeEvent.effectiveDate ∈ [from, to))
  const watchedDocIds = (
    await prisma.watch.findMany({
      where: { workspaceId: params.workspaceId, archivedAt: null, status: "ACTIVE" },
      select: { documentId: true },
    })
  ).map((w) => w.documentId);

  if (watchedDocIds.length > 0) {
    const effectiveRows = await prisma.legalChangeEvent.findMany({
      where: {
        documentId: { in: watchedDocIds },
        effectiveDate: { gte: params.from, lt: params.to },
      },
      select: {
        id: true,
        effectiveDate: true,
        eventType: true,
        document: { select: { currentTitle: true, externalDocumentId: true } },
      },
    });
    for (const e of effectiveRows) {
      events.push({
        kind: "EFFECTIVE",
        date: e.effectiveDate!,
        title: e.document.currentTitle,
        href: `/laws/${e.document.externalDocumentId}?event=${e.id}`,
        meta: eventTypeLabel(e.eventType),
      });
    }
  }

  // 3) Task 마감일
  const taskRows = await prisma.task.findMany({
    where: {
      workspaceId: params.workspaceId,
      archivedAt: null,
      status: { in: ["TODO", "IN_PROGRESS"] },
      dueAt: { gte: params.from, lt: params.to },
    },
    select: { id: true, dueAt: true, title: true, priority: true },
  });
  for (const t of taskRows) {
    events.push({
      kind: "TASK",
      date: t.dueAt!,
      title: t.title,
      href: `/app/tasks/${t.id}`,
      meta: TASK_PRIORITY_LABEL[t.priority as TaskPriority] ?? t.priority,
    });
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}
