"use client";

import { useState } from "react";
import { mapPolicyToArticleAction, removeMappingAction } from "@/lib/policies/actions";
import { useAsyncAction } from "@/lib/useAsyncAction";
import type { CitationCandidate } from "@/lib/policies/candidates";

// 본문에서 찾은 근거 법령 후보. 자동으로 연결하지 않는다 — 추출 정확도가
// 97% 라도 틀린 3% 를 소리 없이 넣으면 담당자가 목록 전체를 못 믿는다.
// 사람이 한 번 눌러 확정한다.
export function CandidateList({
  policyId,
  candidates,
}: {
  policyId: string;
  candidates: CitationCandidate[];
}) {
  const { pending, status, runWithRefresh } = useAsyncAction();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const error = status.kind === "error" ? status.msg : null;

  const found = candidates.filter((c) => c.documentId && !c.alreadyMapped);
  const missing = candidates.filter((c) => !c.documentId);

  if (candidates.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-fg">
        본문에서 찾은 근거 법령 {found.length}건
      </h2>
      {found.length === 0 ? (
        <p className="mt-2 text-sm text-fg-secondary">
          찾은 근거를 모두 연결했습니다.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
          {found.map((c) => {
            const key = `${c.documentId}:${c.contentUnitId ?? ""}`;
            return (
              <li key={key} className="flex items-start justify-between gap-4 p-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {c.documentTitle}
                    {c.contentUnitLabel ? (
                      <span className="ml-1.5 font-normal text-fg-secondary">
                        {c.contentUnitLabel}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-fg-muted">
                    본문 인용 {c.count}회
                    {c.articleLabel && !c.contentUnitId
                      ? ` · ${c.articleLabel}을(를) 법령에서 찾지 못해 법령 단위로 연결됩니다`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setBusyKey(key);
                    void runWithRefresh(() =>
                      mapPolicyToArticleAction({
                        policyId,
                        documentId: c.documentId!,
                        contentUnitId: c.contentUnitId,
                      }),
                    );
                  }}
                  className="shrink-0 rounded-md border border-line px-2.5 py-1 text-sm text-fg hover:bg-subtle disabled:opacity-60"
                >
                  {pending && busyKey === key ? "연결 중…" : "연결"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {missing.length > 0 ? (
        <div className="mt-4 rounded-md border border-line bg-subtle p-3.5">
          <p className="text-sm font-medium text-fg">
            찾지 못한 인용 {missing.length}건
          </p>
          {/* 조용히 버리면 담당자는 빠진 줄도 모른다. 무엇을 못 찾았는지 밝힌다. */}
          <p className="mt-1 text-xs text-fg-secondary">
            본문에는 있으나 수집된 법령에서 같은 제목을 찾지 못했습니다. 법령명이
            줄임말이거나 폐지된 법령일 수 있습니다.
          </p>
          <ul className="mt-2 space-y-1">
            {missing.slice(0, 8).map((c) => (
              <li key={c.normalizedTitle + (c.articleLabel ?? "")} className="text-xs text-fg-muted">
                {c.rawTitle}
                {c.articleLabel ? ` ${c.articleLabel}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function RemoveMappingButton({ mappingId }: { mappingId: string }) {
  const { pending, runWithRefresh } = useAsyncAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void runWithRefresh(() => removeMappingAction(mappingId))}
      className="shrink-0 text-xs text-fg-muted hover:text-danger disabled:opacity-60"
    >
      {pending ? "해제 중…" : "연결 해제"}
    </button>
  );
}
