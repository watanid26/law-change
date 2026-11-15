"use client";

// Task 편집 + 상태 전환 패널.

import { useState } from "react";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { transitionTaskAction, updateTaskAction } from "@/lib/tasks/actions";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/labels";

interface Initial {
  title: string;
  description: string;
  priority: TaskPriority;
  dueAt: string | null; // ISO
}

// 서비스의 VALID_TASK_TRANSITIONS 와 대응.
const NEXT_ACTIONS: Record<TaskStatus, { status: TaskStatus; label: string; style: "primary" | "neutral" }[]> = {
  TODO: [
    { status: "IN_PROGRESS", label: "시작", style: "primary" },
    { status: "DONE",        label: "완료", style: "primary" },
    { status: "CANCELLED",   label: "취소", style: "neutral" },
  ],
  IN_PROGRESS: [
    { status: "DONE",       label: "완료",   style: "primary" },
    { status: "TODO",       label: "예정으로", style: "neutral" },
    { status: "CANCELLED",  label: "취소",   style: "neutral" },
  ],
  DONE:      [{ status: "IN_PROGRESS", label: "다시 진행", style: "neutral" }],
  CANCELLED: [{ status: "TODO", label: "다시 시작", style: "neutral" }],
};

interface Props {
  taskId: string;
  currentStatus: TaskStatus;
  initial: Initial;
}

export function TaskEditPanel({ taskId, currentStatus, initial }: Props) {
  const [state, setState] = useState<Initial>(initial);
  const { pending, status, runWithRefresh } = useAsyncAction();

  const isClosed = currentStatus === "DONE" || currentStatus === "CANCELLED";
  const dirty =
    state.title !== initial.title ||
    state.description !== initial.description ||
    state.priority !== initial.priority ||
    (state.dueAt ?? "") !== (initial.dueAt ?? "");

  function save() {
    void runWithRefresh(
      () => updateTaskAction(taskId, {
        title: state.title,
        description: state.description || null,
        priority: state.priority,
        dueAt: state.dueAt ?? null,
      }),
      undefined,
      "저장되었습니다.",
    );
  }

  function transition(next: TaskStatus) {
    void runWithRefresh(() => transitionTaskAction(taskId, { status: next }));
  }

  const nextActions = NEXT_ACTIONS[currentStatus] ?? [];
  const dueAtInput = state.dueAt ? state.dueAt.slice(0, 10) : "";

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 rounded-md rounded-md border border-line bg-surface p-5 space-y-4">
        <Field label="제목">
          <input
            type="text"
            value={state.title}
            disabled={isClosed}
            onChange={(e) => setState({ ...state, title: e.target.value })}
            className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled disabled:bg-subtle disabled:text-fg-disabled"
          />
        </Field>
        <Field label="설명">
          <textarea
            value={state.description}
            disabled={isClosed}
            onChange={(e) => setState({ ...state, description: e.target.value })}
            rows={5}
            className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled disabled:bg-subtle disabled:text-fg-disabled"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="우선순위">
            <select
              value={state.priority}
              disabled={isClosed}
              onChange={(e) => setState({ ...state, priority: e.target.value as TaskPriority })}
              className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled disabled:bg-subtle disabled:text-fg-disabled select-field"
            >
              {TASK_PRIORITY_VALUES.map((v) => (
                <option key={v} value={v}>{TASK_PRIORITY_LABEL[v]}</option>
              ))}
            </select>
          </Field>
          <Field label="마감일">
            <input
              type="date"
              value={dueAtInput}
              disabled={isClosed}
              onChange={(e) =>
                setState({
                  ...state,
                  dueAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled disabled:bg-subtle disabled:text-fg-disabled"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
          {status.kind === "ok" && <span role="status" aria-live="polite" className="text-sm text-primary-text">{status.msg}</span>}
          {status.kind === "error" && <span role="alert" aria-live="assertive" className="text-sm text-danger">{status.msg}</span>}
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty || isClosed}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:bg-subtle disabled:text-fg-disabled"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      <div className="rounded-md rounded-md border border-line bg-surface p-5">
        <h2 className="text-base font-medium tracking-subtitle text-fg">진행 상태</h2>
        <p className="mt-1 text-xs text-fg-muted">현재: {TASK_STATUS_LABEL[currentStatus]}</p>
        <div className="mt-4 space-y-2">
          {nextActions.map((a) => (
            <button
              key={a.status}
              type="button"
              onClick={() => transition(a.status)}
              disabled={pending}
              // 인박스 전환 패널과 같은 규칙. 상태에 따라 "자주 쓰는 전환"이
              // 둘일 수 있으므로(예정 → 시작 / 완료) 채운 primary 대신
              // outline-primary 로 강조한다. 이 화면의 채운 primary 는 "저장" 하나.
              className={
                "w-full rounded-md px-3 py-2 text-base transition-colors duration-swift disabled:opacity-50 " +
                (a.style === "primary"
                  ? "border border-primary bg-primary-subtle font-medium text-primary-text hover:bg-selected"
                  : "border border-line-strong bg-surface text-fg hover:bg-hover")
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-fg-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
