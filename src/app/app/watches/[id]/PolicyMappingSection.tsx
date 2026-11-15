"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { mapPolicyToWatchAction } from "@/lib/policies/actions";
import { POLICY_TYPE_LABEL, type PolicyType } from "@/lib/policies/labels";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { useConfirm } from "@/components/ui/confirm";

interface Mapping {
  id: string;
  policy: { id: string; type: string; title: string; externalUrl: string | null };
}
interface Option { id: string; type: string; title: string }

interface Props {
  watchId: string;
  mappings: Mapping[];
  policyOptions: Option[];
}

export function PolicyMappingSection({ watchId, mappings: initialMappings, policyOptions }: Props) {
  const confirm = useConfirm();
  const [mappings, setMappings] = useState<Mapping[]>(initialMappings);
  const { pending, status, run, runFetch } = useAsyncAction();
  const mappingsSnapshot = useRef<Mapping[] | null>(null);
  const [selectPolicyId, setSelectPolicyId] = useState<string>("");
  const error = status.kind === "error" ? status.msg : null;

  useEffect(() => {
    if (status.kind === "error" && mappingsSnapshot.current !== null) {
      setMappings(mappingsSnapshot.current);
      mappingsSnapshot.current = null;
    } else if (status.kind === "ok") {
      mappingsSnapshot.current = null;
    }
  }, [status]);

  const linkedIds = new Set(mappings.map((m) => m.policy.id));
  const availableOptions = policyOptions.filter((p) => !linkedIds.has(p.id));

  function link() {
    if (!selectPolicyId) return;
    const policy = policyOptions.find((p) => p.id === selectPolicyId);
    if (!policy) return;
    // link (add) 는 여전히 server action
    void run(
      () => mapPolicyToWatchAction(watchId, selectPolicyId),
      (data) => {
        const mappingId = (data as { mappingId?: string } | undefined)?.mappingId ?? `tmp-${Date.now()}`;
        setMappings((prev) => [
          ...prev,
          { id: mappingId, policy: { ...policy, externalUrl: null } },
        ]);
        setSelectPolicyId("");
      },
    );
  }

  async function unlink(mappingId: string) {
    const ok = await confirm({
      title: "이 연결을 삭제할까요?",
      body: "법령과 사규의 연결만 끊습니다. 사규 문서 자체는 그대로 남습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    mappingsSnapshot.current = mappings;
    setMappings((prev) => prev.filter((m) => m.id !== mappingId));
    void runFetch({
      url: `/api/policy-mappings/${mappingId}`,
      method: "DELETE",
    });
  }

  return (
    <div className="mt-6 rounded-md rounded-md border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs text-fg-muted">
          연결된 내부 사규 <span className="text-fg-muted">({mappings.length})</span>
        </h2>
        <Link href="/app/policies" className="text-xs text-primary-text hover:underline">
          사규 관리 →
        </Link>
      </div>

      {mappings.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">
          아직 연결된 사규가 없습니다. 아래에서 등록된 사규를 연결하세요.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {mappings.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="text-sm text-fg">{m.policy.title}</div>
                <div className="text-xs text-fg-muted">
                  {POLICY_TYPE_LABEL[m.policy.type as PolicyType] ?? m.policy.type}
                  {m.policy.externalUrl && (
                    <>
                      {" · "}
                      <a
                        href={m.policy.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-text hover:underline"
                      >
                        문서 열기 →
                      </a>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => unlink(m.id)}
                disabled={pending}
                className="whitespace-nowrap text-xs text-danger hover:underline disabled:opacity-50"
              >
                연결 해제
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
        <select
          value={selectPolicyId}
          onChange={(e) => setSelectPolicyId(e.target.value)}
          disabled={pending || availableOptions.length === 0}
          className="flex-1 border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled select-field"
        >
          <option value="">
            {availableOptions.length === 0 ? "연결 가능한 사규가 없습니다" : "사규 선택..."}
          </option>
          {availableOptions.map((p) => (
            <option key={p.id} value={p.id}>
              [{POLICY_TYPE_LABEL[p.type as PolicyType] ?? p.type}] {p.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={link}
          disabled={pending || !selectPolicyId}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:bg-subtle disabled:text-fg-disabled"
        >
          {pending ? "연결 중..." : "연결"}
        </button>
      </div>
      {error && <p role="alert" aria-live="assertive" className="mt-2 text-sm text-danger">{error}</p>}
      {availableOptions.length === 0 && policyOptions.length === 0 && (
        <p className="mt-2 text-xs text-fg-muted">
          <Link href="/app/policies" className="text-primary-text hover:underline">사규 관리</Link> 에서 먼저 내부 사규를 등록하세요.
        </p>
      )}
    </div>
  );
}
