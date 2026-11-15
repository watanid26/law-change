"use client";

// Inbox 상세에서 Task 를 만드는 인라인 폼 (개인 사용).
// 담당자 = 자기 자신 (auto), Inbox 로부터 우선순위 상속.

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { createTaskFromInboxAction } from "@/lib/tasks/actions";
import { TASK_PRIORITY_LABEL, TASK_PRIORITY_VALUES, type TaskPriority } from "@/lib/tasks/labels";
import { useAsyncAction } from "@/lib/useAsyncAction";

interface Props {
  inboxId: string;
  suggestedTitle: string;
  defaultPriority: TaskPriority;
}

export function CreateTaskFromInbox({ inboxId, suggestedTitle, defaultPriority }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(suggestedTitle);
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(defaultPriority);
  const [dueAt, setDueAt] = useState<string>("");
  const { pending, status, run } = useAsyncAction();
  const [validationError, setValidationError] = useState<string | null>(null);
  const error = status.kind === "error" ? status.msg : validationError;

  function submit() {
    if (!title.trim()) { setValidationError("업무 제목을 입력해주세요."); return; }
    setValidationError(null);
    void run(
      () => createTaskFromInboxAction({
        inboxItemId: inboxId,
        title: title.trim(),
        description: desc.trim() || undefined,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      }),
      (data) => {
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
        className="inline-flex items-center gap-1.5 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover"
      >
        <span aria-hidden="true">＋</span> 업무 만들기
      </button>
    );
  }

  return (
    <div className="border-l-[3px] border-primary border-y border-r border-line bg-surface p-4 space-y-3">
      <div>
        <label className="block text-xs text-fg-muted mb-1.5">제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled "
        />
      </div>
      <div>
        <label className="block text-xs text-fg-muted mb-1.5">설명 (선택)</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          placeholder="예: 개인정보처리방침 갱신, 사규 개정 검토"
          className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled "
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs text-fg-muted mb-1.5">우선순위</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="mt-1 h-10 rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled select-field"
          >
            {TASK_PRIORITY_VALUES.map((v) => (
              <option key={v} value={v}>{TASK_PRIORITY_LABEL[v]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-fg-muted mb-1.5">마감일 (선택)</label>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="mt-1 h-10 rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled "
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
        </div>
      </div>
      {error && <p role="alert" aria-live="assertive" className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-swift hover:bg-hover"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !title.trim()}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:bg-subtle/50"
        >
          {pending ? "만드는 중..." : "업무 만들기"}
        </button>
      </div>
    </div>
  );
}
