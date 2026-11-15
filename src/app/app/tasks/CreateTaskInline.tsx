"use client";

// 독립 Task 를 목록 상단에서 바로 추가.

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { createStandaloneTaskAction } from "@/lib/tasks/actions";
import { TASK_PRIORITY_LABEL, TASK_PRIORITY_VALUES, type TaskPriority } from "@/lib/tasks/labels";
import { useAsyncAction } from "@/lib/useAsyncAction";

// 라운드 19-C3: 담당자 드롭다운 지원 (workspace 구성원 2명 이상일 때만 노출).
interface AssignableMember {
  id: string;
  label: string;
  isCurrentUser: boolean;
}

export function CreateTaskInline({ members = [] }: { members?: AssignableMember[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [dueAt, setDueAt] = useState<string>("");
  const currentMember = members.find((m) => m.isCurrentUser);
  const [assigneeId, setAssigneeId] = useState<string>(currentMember?.id ?? "");
  const { pending, status, run } = useAsyncAction();
  const [validationError, setValidationError] = useState<string | null>(null);
  const error = status.kind === "error" ? status.msg : validationError;
  const showAssigneePicker = members.length > 1;

  function submit() {
    if (!title.trim()) { setValidationError("업무 제목을 입력해주세요."); return; }
    setValidationError(null);
    void run(
      () => createStandaloneTaskAction({
        title: title.trim(),
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        assigneeMemberId: assigneeId || undefined,
      }),
      (data) => {
        setOpen(false);
        setTitle("");
        setDueAt("");
        setAssigneeId(currentMember?.id ?? "");
        // 새 업무 상세로 이동은 transition으로 감싸 concurrent navigation.
        const taskId = (data as { taskId?: string } | undefined)?.taskId;
        if (taskId) {
          startTransition(() => {
            router.push(`/app/tasks/${taskId}`);
            router.refresh();
          });
        }
      },
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover"
      >
        ＋ 업무 추가
      </button>
    );
  }

  return (
    <div className="w-full max-w-md border border-line border-l-[3px] border-l-primary bg-surface p-4 space-y-3">
      <input
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="예: 개인정보처리방침 갱신 검토"
        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled "
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="border border-line-strong bg-surface px-2 py-2 text-sm focus:border-primary focus:outline-none select-field"
        >
          {TASK_PRIORITY_VALUES.map((v) => (
            <option key={v} value={v}>{TASK_PRIORITY_LABEL[v]}</option>
          ))}
        </select>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="border border-line-strong bg-surface px-2 py-2 text-sm focus:border-primary focus:outline-none "
        />
        {dueAt ? (
          <p className="mt-1 text-sm text-fg-muted">
            {new Date(dueAt).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            마감
          </p>
        ) : null}
        {showAssigneePicker && (
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            aria-label="담당자"
            className="border border-line-strong bg-surface px-2 py-2 text-sm focus:border-primary focus:outline-none select-field"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.isCurrentUser ? " (나)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <p role="alert" aria-live="assertive" className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setTitle(""); }}
          disabled={pending}
          className="border border-line bg-surface px-3 py-1.5 text-sm text-fg hover:bg-hover"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !title.trim()}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:bg-subtle disabled:text-fg-disabled"
        >
          {pending ? "추가 중..." : "추가"}
        </button>
      </div>
    </div>
  );
}
