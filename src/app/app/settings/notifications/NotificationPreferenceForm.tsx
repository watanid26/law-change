"use client";

import { useEffect, useState } from "react";
import { updateNotificationPreferenceAction } from "@/lib/preferences/actions";
import {
  DIGEST_MODE_DESC,
  DIGEST_MODE_LABEL,
  DIGEST_MODES,
  type DigestMode,
} from "@/lib/preferences/notification-labels";
import { useAsyncAction } from "@/lib/useAsyncAction";

interface Initial {
  changeInApp: boolean;
  changeEmail: boolean;
  reminderInApp: boolean;
  reminderEmail: boolean;
  digestMode: DigestMode;
}

export function NotificationPreferenceForm({ initial }: { initial: Initial }) {
  const [state, setState] = useState<Initial>(initial);
  const { pending, status, runWithRefresh } = useAsyncAction();
  const msg = status.kind === "ok"
    ? { kind: "ok" as const, text: status.msg }
    : status.kind === "error"
      ? { kind: "error" as const, text: status.msg }
      : { kind: "idle" as const };

  const dirty = (Object.keys(state) as Array<keyof Initial>).some((k) => state[k] !== initial[k]);

  // 라운드 17 T7: 저장하지 않은 변경사항이 있을 때 탭 닫기·새로고침 방지.
  // Next.js 14 App Router 는 라우팅 자체를 인터셉트하는 훅이 아직 없으므로
  // beforeunload 만 걸어 브라우저 나가기·새로고침만 방어. 내부 라우팅은
  // 상단 nav 링크에 개별 confirm 을 얹어야 완전 방어.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function save() {
    void runWithRefresh(
      () => updateNotificationPreferenceAction(state),
      undefined,
      "저장되었습니다.",
    );
  }

  return (
    <div className="mt-6 space-y-8 rounded-md rounded-md border border-line bg-surface p-5">
      {/* 이메일이 유일한 발송 채널이다. 인앱 알림 토글은 제거했다 —
          알림을 볼 인앱 화면 자체가 없어서, 켜 두면 알림이 조용히 사라졌다.
          (changeInApp/reminderInApp 컬럼은 남겨 두되 UI 에서 노출하지 않는다.) */}
      <Section title="법령 개정 감지">
        <Toggle
          label="이메일 알림"
          desc="관심 법령이 개정되면 이메일로 알려드립니다"
          checked={state.changeEmail}
          dirty={state.changeEmail !== initial.changeEmail}
          onChange={(v) => setState({ ...state, changeEmail: v })}
        />
      </Section>

      <Section title="예정 알림">
        <Toggle
          label="이메일 알림"
          desc="검토 일정과 업무 마감이 다가오면 이메일로 알려드립니다"
          checked={state.reminderEmail}
          dirty={state.reminderEmail !== initial.reminderEmail}
          onChange={(v) => setState({ ...state, reminderEmail: v })}
        />
      </Section>

      <Section title="발송 빈도">
        <select
          value={state.digestMode}
          onChange={(e) => setState({ ...state, digestMode: e.target.value as DigestMode })}
          className="mt-1 border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none select-field"
        >
          {DIGEST_MODES.map((m) => (
            <option key={m} value={m}>{DIGEST_MODE_LABEL[m]}</option>
          ))}
        </select>
        {/* "즉시 발송만 지원합니다" 라고 적혀 있었는데 사실이 아니다. 요약
            발송은 매일 도는 cron 에서 실제로 나가고 있고(runDigestBatch),
            즉시 발송도 digestMode 를 보고 건너뛴다. 안내문이 코드보다
            오래된 것이었다 — 무엇을 고르면 무슨 일이 일어나는지로 바꾼다. */}
        <p className="mt-2 text-xs text-fg-muted">{DIGEST_MODE_DESC[state.digestMode]}</p>
        <p className="mt-1 text-xs text-fg-muted">
          요약은 위의 &ldquo;조문 변경 · 이메일 알림&rdquo; 이 켜져 있을 때만 나갑니다.
        </p>
      </Section>

      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        {dirty && msg.kind !== "ok" && (
          <span className="text-xs text-primary-text" aria-live="polite">
            저장하지 않은 변경사항이 있습니다
          </span>
        )}
        {msg.kind === "ok" && <span role="status" aria-live="polite" className="text-sm text-primary-text">{msg.text}</span>}
        {msg.kind === "error" && <span role="alert" aria-live="assertive" className="text-sm text-danger">{msg.text}</span>}
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:bg-subtle disabled:text-fg-disabled"
        >
          {pending ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-fg-muted mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Toggle({
  label, desc, checked, dirty, onChange,
}: {
  label: string; desc?: string; checked: boolean; dirty?: boolean; onChange: (v: boolean) => void;
}) {
  // 라운드 17 T7: dirty 필드는 좌측 accent 보더로 시각화 → 저장 필요한 항목이 즉시 스캔됨.
  const dirtyClass = dirty
    ? "border-l-[3px] border-l-primary bg-primary-subtle/40"
    : "border-l border-l-rule-soft";
  return (
    <label className={`flex w-full items-start gap-3 border border-line bg-surface p-3 hover:bg-hover cursor-pointer transition-colors duration-swift ${dirtyClass}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-primary"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-fg">{label}</div>
        {desc && <div className="mt-0.5 text-xs text-fg-secondary">{desc}</div>}
      </div>
    </label>
  );
}
