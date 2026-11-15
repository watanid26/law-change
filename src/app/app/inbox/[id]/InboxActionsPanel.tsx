"use client";

// Inbox 상세 편집 + 상태 전환 패널.
// 좌측: 판단(applicability/impact/text/담당자/부서) 저장
// 우측: 상태 전환 버튼들 (허용 가능한 것만 활성화)

import { useState } from "react";
import { assessInboxAction, transitionInboxAction } from "@/lib/inbox/actions";
import { useAsyncAction } from "@/lib/useAsyncAction";
import {
  IMPACT_LEVEL_LABEL,
  IMPACT_LEVEL_VALUES,
  INBOX_APPLICABILITY_LABEL,
  INBOX_APPLICABILITY_VALUES,
  INBOX_STATUS_LABEL,
  type InboxStatus,
} from "@/lib/inbox/labels";
import { useConfirm } from "@/components/ui/confirm";

interface Initial {
  applicability: string;
  applicabilityReason: string;
  impactLevel: string | null;
  assessmentText: string;
  ownerDepartmentId: string | null;
  assignedToMemberId: string | null;
}

// service.ts 의 VALID_TRANSITIONS 를 UI 표시용으로 그대로 매핑.
// (서버가 최종 권위 — UI 는 UX 힌트만 제공)
// 라운드 29-2 개선: 각 전환에 짧은 설명(hint) 을 추가해 "왜 이 색깔인지" 사용자에 노출.
type NextAction = {
  status: InboxStatus;
  label: string;
  style: "primary" | "neutral" | "danger";
  hint: string;
};
const NEXT_ACTIONS: Record<InboxStatus, NextAction[]> = {
  NEW: [
    { status: "REVIEWING", label: "검토 시작", style: "primary", hint: "지금 이 개정을 검토하기 시작합니다." },
    { status: "DISMISSED", label: "기각", style: "neutral", hint: "이 알림 자체를 무시합니다 (다시 안 봄)." },
  ],
  REVIEWING: [
    { status: "ACTION_REQUIRED", label: "조치 필요", style: "primary", hint: "이 개정 때문에 실제로 할 게 있음 (사규 수정 · 절차 변경 등)." },
    { status: "MONITORING",      label: "모니터링", style: "neutral", hint: "지금은 아니지만 계속 지켜봐야 함." },
    { status: "DONE",            label: "검토 완료", style: "primary", hint: "확인했고 우리 회사엔 특별한 조치 필요 없음." },
    { status: "DISMISSED",       label: "기각",     style: "neutral", hint: "우리와 완전히 무관. 이력만 남기고 종결." },
  ],
  ACTION_REQUIRED: [
    { status: "DONE",       label: "조치 완료", style: "primary", hint: "필요한 조치를 마쳤음. 인박스에서 종결." },
    { status: "MONITORING", label: "모니터링", style: "neutral", hint: "조치를 잠시 보류하고 상황을 지켜봅니다." },
    { status: "DISMISSED",  label: "기각",     style: "neutral", hint: "조치가 실제로 필요 없다고 재판정." },
  ],
  MONITORING: [
    { status: "ACTION_REQUIRED", label: "조치 필요", style: "primary", hint: "지켜본 결과 실제로 조치가 필요함." },
    { status: "DONE",            label: "완료",     style: "primary", hint: "지켜본 결과 별 영향 없음. 종결." },
    { status: "DISMISSED",       label: "기각",     style: "neutral", hint: "우리와 무관으로 재판정." },
  ],
  DONE:      [{ status: "REVIEWING", label: "재검토", style: "neutral", hint: "완료 판정을 되돌리고 다시 검토합니다." }],
  DISMISSED: [{ status: "REVIEWING", label: "재검토", style: "neutral", hint: "기각 판정을 되돌리고 다시 검토합니다." }],
};

interface Props {
  inboxId: string;
  currentStatus: InboxStatus;
  initial: Initial;
  memberOptions: Array<{ id: string; label: string }>;
  departmentOptions: Array<{ id: string; label: string }>;
}

export function InboxActionsPanel({
  inboxId, currentStatus, initial, memberOptions, departmentOptions,
}: Props) {
  const confirm = useConfirm();
  const [state, setState] = useState<Initial>(initial);
  const { pending, status, runWithRefresh } = useAsyncAction();
  const msg = status.kind === "ok"
    ? { kind: "ok" as const, text: status.msg }
    : status.kind === "error"
      ? { kind: "error" as const, text: status.msg }
      : { kind: "idle" as const };

  const dirty =
    state.applicability !== initial.applicability ||
    state.applicabilityReason !== initial.applicabilityReason ||
    state.impactLevel !== initial.impactLevel ||
    state.assessmentText !== initial.assessmentText ||
    state.ownerDepartmentId !== initial.ownerDepartmentId ||
    state.assignedToMemberId !== initial.assignedToMemberId;

  function saveAssessment() {
    void runWithRefresh(
      () => assessInboxAction(inboxId, {
        applicability: state.applicability,
        applicabilityReason: state.applicabilityReason || null,
        impactLevel: state.impactLevel,
        assessmentText: state.assessmentText || null,
        ownerDepartmentId: state.ownerDepartmentId || null,
        assignedToMemberId: state.assignedToMemberId || null,
      }),
      undefined,
      "저장되었습니다.",
    );
  }

  async function transition(next: InboxStatus) {
    // 라운드 30-6: 종결(DONE/DISMISSED) 은 되돌리기 부담이 있으니 확인 대화상자.
    // ACTION_REQUIRED/MONITORING/REVIEWING 은 워크플로 진행이라 확인 불필요.
    if (next === "DONE" || next === "DISMISSED") {
      const label = next === "DONE" ? "검토 완료" : "기각";
      const ok = await confirm({
        title: `"${label}" 로 처리할까요?`,
        body: "변경 알림 목록에서 사라집니다. 나중에 상세 화면에서 재검토로 되돌릴 수 있습니다.",
        confirmLabel: label,
      });
      if (!ok) {
        return;
      }
    }
    void runWithRefresh(() => transitionInboxAction(inboxId, { status: next }));
  }

  const nextActions = NEXT_ACTIONS[currentStatus] ?? [];

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* 좌측: 판단 저장 */}
      <div className="lg:col-span-2 rounded-md rounded-md border border-line bg-surface p-5 space-y-5">
        <h2 className="text-base font-medium tracking-subtitle text-fg">우리 조직 판단</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="적용 여부">
            <select
              value={state.applicability}
              onChange={(e) => setState({ ...state, applicability: e.target.value })}
              className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled select-field"
            >
              {INBOX_APPLICABILITY_VALUES.map((v) => (
                <option key={v} value={v}>{INBOX_APPLICABILITY_LABEL[v]}</option>
              ))}
            </select>
          </Field>
          <Field label="영향도">
            <select
              value={state.impactLevel ?? ""}
              onChange={(e) => setState({ ...state, impactLevel: e.target.value || null })}
              className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled select-field"
            >
              <option value="">미정</option>
              {IMPACT_LEVEL_VALUES.map((v) => (
                <option key={v} value={v}>{IMPACT_LEVEL_LABEL[v]}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="판단 사유">
          <textarea
            value={state.applicabilityReason}
            onChange={(e) => setState({ ...state, applicabilityReason: e.target.value })}
            rows={2}
            placeholder="예: 우리는 온라인 서비스를 운영하므로 이번 개정 적용"
            className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled "
          />
        </Field>

        <Field label="검토 메모">
          <textarea
            value={state.assessmentText}
            onChange={(e) => setState({ ...state, assessmentText: e.target.value })}
            rows={4}
            placeholder="변경 내용, 우리 조직에 미치는 영향, 필요한 후속 조치 등을 기록"
            className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled "
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="담당 부서">
            <select
              value={state.ownerDepartmentId ?? ""}
              onChange={(e) => setState({ ...state, ownerDepartmentId: e.target.value || null })}
              className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled select-field"
            >
              <option value="">지정 없음</option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </Field>
          <Field label="담당자">
            <select
              value={state.assignedToMemberId ?? ""}
              onChange={(e) => setState({ ...state, assignedToMemberId: e.target.value || null })}
              className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled select-field"
            >
              <option value="">지정 없음</option>
              {memberOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
          {msg.kind === "ok" && <span role="status" aria-live="polite" className="text-sm text-primary-text">{msg.text}</span>}
          {msg.kind === "error" && <span role="alert" aria-live="assertive" className="text-sm text-danger">{msg.text}</span>}
          <button
            type="button"
            onClick={saveAssessment}
            disabled={pending || !dirty}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:bg-subtle/50"
          >
            {pending ? "저장 중..." : "판단 저장"}
          </button>
        </div>
      </div>

      {/* 우측: 상태 전환 */}
      <div className="rounded-md rounded-md border border-line bg-surface p-5">
        <h2 className="text-base font-medium tracking-subtitle text-fg">진행 상태</h2>
        <p className="mt-1 text-sm text-fg-secondary">
          현재{" "}
          <span className="font-medium text-fg">
            {INBOX_STATUS_LABEL[currentStatus]}
          </span>
        </p>
        {/* 사용성 테스트: "판단 저장만 눌렀는데 상태가 저절로 바뀌었다".
             실제로는 상세 화면을 여는 순간 신규→검토 중으로 자동 전환된다.
             동작을 바꾸는 대신(열어봤으면 검토 중인 게 맞다) 화면에서 알린다. */}
        {currentStatus === "REVIEWING" ? (
          <p className="mt-1 text-xs text-fg-muted">
            이 화면을 열면 자동으로 검토 중이 됩니다.
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          {nextActions.length === 0 && (
            <p className="text-xs text-fg-secondary">더 이상 전환 가능한 상태가 없습니다.</p>
          )}
          {nextActions.map((a) => (
            <div key={a.status} className="space-y-1">
              <button
                type="button"
                onClick={() => transition(a.status)}
                disabled={pending}
                title={a.hint}
                // R33 감사 #3: "자주 쓰는 전환"이 상태에 따라 두 개인데(검토 중 →
                // 조치 필요 / 검토 완료) 둘 다 채운 primary 로 그리면 "이게 기본
                // 동선"이라는 신호가 두 곳에서 나와 기준점이 흐려진다. 게다가 이
                // 화면의 채운 primary 는 좌측 "저장" 하나여야 한다.
                // → 자주 쓰는 전환은 outline-primary(강조)로, 나머지는 plain outline.
                className={
                  "w-full rounded-md px-3 py-2 text-base transition-colors duration-swift ease-swift disabled:opacity-50 " +
                  (a.style === "primary"
                    ? "border border-primary bg-primary-subtle font-medium text-primary-text hover:bg-selected"
                    : a.style === "danger"
                      ? "border border-danger bg-danger-subtle text-danger hover:opacity-90"
                      : "border border-line-strong bg-surface text-fg hover:bg-hover")
                }
              >
                {a.label}
              </button>
              <p className="text-xs text-fg-secondary px-1">{a.hint}</p>
            </div>
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
