import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserContext } from "@/lib/auth/session";
import { getTaskDetail } from "@/lib/tasks/queries";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/labels";
import { Badge, Breadcrumb, PageHeader, Panel } from "@/components/ui";
import { INBOX_STATUS_LABEL, type InboxStatus } from "@/lib/inbox/labels";
import { TaskEditPanel } from "./TaskEditPanel";
import { EvidencePanel } from "./EvidencePanel";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireUserContext();
  const task = await getTaskDetail(ctx.workspaceId, params.id);
  if (!task) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[{ label: "업무", href: "/app/tasks" }, { label: task.title }]}
          />
        }
        title={task.title}
        description={task.description || undefined}
        actions={
          <>
            <Badge tone={TASK_STATUS_TONE[task.status as TaskStatus] ?? "neutral"}>
              {TASK_STATUS_LABEL[task.status as TaskStatus] ?? task.status}
            </Badge>
            <Badge tone={TASK_PRIORITY_TONE[task.priority as TaskPriority] ?? "neutral"}>
              {TASK_PRIORITY_LABEL[task.priority as TaskPriority] ?? task.priority}
            </Badge>
          </>
        }
      />

      {task.inboxItem && (
        <Panel className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
          <span className="text-fg-muted">연결 변경</span>
          <Link
            href={`/app/inbox/${task.inboxItem.id}`}
            className="font-medium text-fg hover:text-primary-text"
          >
            {task.inboxItem.changeEvent.document.currentTitle}
          </Link>
          {task.inboxItem.status && (
            <Badge tone="neutral">
              {INBOX_STATUS_LABEL[task.inboxItem.status as InboxStatus] ??
                task.inboxItem.status}
            </Badge>
          )}
        </Panel>
      )}

      <TaskEditPanel
        taskId={task.id}
        currentStatus={task.status as TaskStatus}
        initial={{
          title: task.title,
          description: task.description ?? "",
          priority: task.priority as TaskPriority,
          dueAt: task.dueAt?.toISOString() ?? null,
        }}
      />

      <EvidencePanel
        taskId={task.id}
        evidences={task.evidence.map((e) => ({
          id: e.id,
          type: e.type,
          externalUrl: e.externalUrl,
          fileReference: e.fileReference,
          description: e.description,
          createdAt: e.createdAt.toISOString(),
          uploaderName: e.uploadedByMember?.user.displayName
            ?? e.uploadedByMember?.user.email
            ?? null,
        }))}
      />
    </div>
  );
}
