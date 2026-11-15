"use client";

// Watch 상세 편집 폼 — 서버 액션 호출로 개별 필드 저장/검토 완료/관심 해제.

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  APPLICABILITY_LABEL,
  APPLICABILITY_VALUES,
  IMPORTANCE_LABEL,
  IMPORTANCE_VALUES,
  REVIEW_FREQUENCY_LABEL,
  REVIEW_FREQUENCY_VALUES,
} from "@/lib/watches/labels";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { useConfirm } from "@/components/ui/confirm";

interface Initial {
  applicabilityStatus: string;
  applicabilityReason: string;
  importance: string;
  ownerDepartmentId: string | null;
  ownerMemberId: string | null;
  reviewFrequencyMonths: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  notifyOnChange: boolean;
  notifyEmail: boolean;
  status: string;
}

interface Props {
  watchId: string;
  initial: Initial;
  memberOptions: Array<{ id: string; label: string }>;
  departmentOptions: Array<{ id: string; label: string }>;
}

export function WatchEditForm({ watchId, initial, memberOptions, departmentOptions }: Props) {
  const confirm = useConfirm();
  const router = useRouter();
  const [state, setState] = useState<Initial>(initial);
  const { pending, status, runFetch } = useAsyncAction();
  // reviewComplete 후 서버가 반환한 갱신 날짜를 로컬로 표시하기 위한 오버라이드.
  // 라운드 6 QA: router.refresh 없이도 "다음 검토일"을 즉시 반영하기 위함 (stale UI 제거).
  const [reviewOverride, setReviewOverride] = useState<{ lastReviewedAt: string; nextReviewAt: string | null } | null>(null);
  const displayLastReviewedAt = reviewOverride?.lastReviewedAt ?? state.lastReviewedAt;
  const displayNextReviewAt = reviewOverride?.nextReviewAt !== undefined ? reviewOverride.nextReviewAt : state.nextReviewAt;

  const isArchived = state.status === "ARCHIVED";
  const dirty =
    state.applicabilityStatus !== initial.applicabilityStatus ||
    state.applicabilityReason !== initial.applicabilityReason ||
    state.importance !== initial.importance ||
    state.ownerDepartmentId !== initial.ownerDepartmentId ||
    state.ownerMemberId !== initial.ownerMemberId ||
    state.reviewFrequencyMonths !== initial.reviewFrequencyMonths ||
    state.notifyOnChange !== initial.notifyOnChange ||
    state.notifyEmail !== initial.notifyEmail;

  function save() {
    void runFetch(
      {
        url: `/api/watches/${watchId}/update`,
        method: "POST",
        body: JSON.stringify({
          applicabilityStatus: state.applicabilityStatus,
          applicabilityReason: state.applicabilityReason || null,
          importance: state.importance,
          ownerDepartmentId: state.ownerDepartmentId || null,
          ownerMemberId: state.ownerMemberId || null,
          reviewFrequencyMonths: state.reviewFrequencyMonths,
          notifyOnChange: state.notifyOnChange,
          notifyEmail: state.notifyEmail,
        }),
      },
      undefined,
      "저장되었습니다.",
    );
  }

  function reviewComplete() {
    void runFetch<{ lastReviewedAt: string; nextReviewAt: string | null }>(
      {
        url: `/api/watches/${watchId}/review-complete`,
        method: "POST",
      },
      (data) => {
        if (data) setReviewOverride(data);
      },
      "검토 완료로 기록되었습니다.",
    );
  }

  async function archive() {
    const ok = await confirm({
      title: "관심 법령에서 제외할까요?",
      body: "개정 알림을 더 이상 받지 않습니다. 지금까지의 검토 기록은 그대로 남고, 다시 등록하면 이어집니다.",
      confirmLabel: "제외",
      tone: "danger",
    });
    if (!ok) return;
    void runFetch(
      { url: `/api/watches/${watchId}/archive`, method: "POST" },
      () => { router.push("/app/watches"); },
    );
  }

  return (
    <div className="mt-6 rounded-md rounded-md border border-line bg-surface p-5 space-y-6">
      <Section title="적용 여부">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="상태">
            <select
              value={state.applicabilityStatus}
              disabled={isArchived}
              onChange={(e) => setState({ ...state, applicabilityStatus: e.target.value })}
              className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled disabled:bg-subtle disabled:text-fg-disabled select-field"
            >
              {APPLICABILITY_VALUES.map((v) => (
                <option key={v} value={v}>{APPLICABILITY_LABEL[v]}</option>
              ))}
            </select>
          </Field>
          <Field label="중요도">
            <select
              value={state.importance}
              disabled={isArchived}
              onChange={(e) => setState({ ...state, importance: e.target.value })}
              className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled disabled:bg-subtle disabled:text-fg-disabled select-field"
            >
              {IMPORTANCE_VALUES.map((v) => (
                <option key={v} value={v}>{IMPORTANCE_LABEL[v]}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="판단 사유">
          <textarea
            value={state.applicabilityReason}
            disabled={isArchived}
            onChange={(e) => setState({ ...state, applicabilityReason: e.target.value })}
            placeholder="예: 온라인 서비스에서 개인정보를 처리하므로 적용"
            rows={3}
            className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled disabled:bg-subtle disabled:text-fg-disabled"
          />
        </Field>
      </Section>

      <Section title="담당">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="담당 부서">
            <select
              value={state.ownerDepartmentId ?? ""}
              disabled={isArchived}
              onChange={(e) => setState({ ...state, ownerDepartmentId: e.target.value || null })}
              className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled disabled:bg-subtle disabled:text-fg-disabled select-field"
            >
              <option value="">지정 없음</option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            {departmentOptions.length === 0 && (
              <p className="mt-1 text-xs text-fg-muted">등록된 부서가 없습니다.</p>
            )}
          </Field>
          <Field label="담당자">
            <select
              value={state.ownerMemberId ?? ""}
              disabled={isArchived}
              onChange={(e) => setState({ ...state, ownerMemberId: e.target.value || null })}
              className="mt-1 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled disabled:bg-subtle disabled:text-fg-disabled select-field"
            >
              <option value="">지정 없음</option>
              {memberOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="검토 주기">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="주기">
            <select
              value={String(state.reviewFrequencyMonths)}
              disabled={isArchived}
              onChange={(e) => setState({ ...state, reviewFrequencyMonths: Number(e.target.value) })}
              className="mt-1 h-10 rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled disabled:bg-subtle disabled:text-fg-disabled select-field"
            >
              {REVIEW_FREQUENCY_VALUES.map((v) => (
                <option key={v} value={v}>{REVIEW_FREQUENCY_LABEL[String(v)]}</option>
              ))}
            </select>
          </Field>
          <div className="text-xs text-fg-muted">
            최근 검토: {fmtISO(displayLastReviewedAt) ?? "—"}
            <br />
            다음 검토: {fmtISO(displayNextReviewAt) ?? "—"}
          </div>
          <button
            type="button"
            onClick={reviewComplete}
            disabled={pending || isArchived}
            className="ml-auto inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-swift hover:bg-hover disabled:opacity-50"
          >
            검토 완료로 기록
          </button>
        </div>
      </Section>

      <Section title="알림">
        <label className="flex items-start gap-2.5 text-base text-fg">
          <input
            type="checkbox"
            checked={state.notifyEmail}
            className="mt-1 accent-primary"
            onChange={(e) =>
              setState({ ...state, notifyEmail: e.target.checked })
            }
          />
          <span>
            이 법령이 개정되면 이메일 받기
            <span className="mt-0.5 block text-sm text-fg-muted">
              알림은 이메일로만 발송됩니다.
            </span>
          </span>
        </label>
      </Section>

      <div className="flex items-center justify-between border-t border-line pt-4">
        <button
          type="button"
          onClick={archive}
          disabled={pending || isArchived}
          className="text-sm text-danger hover:underline disabled:opacity-50"
        >
          관심 해제
        </button>
        <div className="flex items-center gap-3">
          {/* 접근성: role/aria-live 로 스크린리더가 상태를 즉시 안내. */}
          {status.kind === "ok" && (
            <span role="status" aria-live="polite" className="text-sm text-primary-text">
              {status.msg}
            </span>
          )}
          {status.kind === "error" && (
            <span role="alert" aria-live="assertive" className="text-sm text-danger">
              {status.msg}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty || isArchived}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:bg-subtle disabled:text-fg-disabled"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs text-fg-muted">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
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

function fmtISO(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}
