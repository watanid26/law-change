"use client";

// Watch 조문 단위 감시 설정.
// - Scope 없음 = 문서 전체 감시 (기본)
// - Scope 있으면 해당 조문에 변경 발생 시만 Inbox 생성

import { useEffect, useRef, useState } from "react";
import { addWatchScopeAction } from "@/lib/watches/actions";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { useConfirm } from "@/components/ui/confirm";

interface ContentUnit {
  id: string;
  unitType: string;
  canonicalKey: string;
  currentLabel: string | null;
}
interface Scope {
  id: string;
  contentUnit: ContentUnit;
}

interface Props {
  watchId: string;
  scopes: Scope[];
  contentUnitOptions: ContentUnit[];
}

const UNIT_TYPE_LABEL: Record<string, string> = {
  ARTICLE: "조문",
  ADDENDUM: "부칙",
  ANNEX: "별표",
  FORM: "서식",
  TABLE: "표",
  CHAPTER: "장",
  SECTION: "절",
  OTHER: "기타",
};

export function WatchScopeSection({ watchId, scopes: initialScopes, contentUnitOptions }: Props) {
  const confirm = useConfirm();
  // 라운드 7: server action → API route (프리징 원인 제거, HTTP 상태 = truth)
  const [scopes, setScopes] = useState<Scope[]>(initialScopes);
  const [selectId, setSelectId] = useState<string>("");
  const { pending, status, run, runFetch } = useAsyncAction();
  const scopesSnapshot = useRef<Scope[] | null>(null);
  const error = status.kind === "error" ? status.msg : null;

  useEffect(() => {
    if (status.kind === "error" && scopesSnapshot.current !== null) {
      setScopes(scopesSnapshot.current);
      scopesSnapshot.current = null;
    } else if (status.kind === "ok") {
      scopesSnapshot.current = null;
    }
  }, [status]);

  const scopedIds = new Set(scopes.map((s) => s.contentUnit.id));
  const available = contentUnitOptions.filter((cu) => !scopedIds.has(cu.id));
  const isFullDocumentMode = scopes.length === 0;

  function add() {
    if (!selectId) return;
    const unit = contentUnitOptions.find((cu) => cu.id === selectId);
    if (!unit) return;
    // add 는 여전히 server action (add scope 는 프리징 안 잡힘, 유지)
    void run(
      () => addWatchScopeAction(watchId, selectId),
      (data) => {
        const scopeId = (data as { scopeId?: string } | undefined)?.scopeId ?? `tmp-${Date.now()}`;
        setScopes((prev) => [...prev, { id: scopeId, contentUnit: unit }]);
        setSelectId("");
      },
    );
  }

  async function remove(scopeId: string) {
    const ok = await confirm({
      title: "이 조문 감시를 해제할까요?",
      body: "해당 조문이 바뀌어도 더 이상 알림을 받지 않습니다.",
      confirmLabel: "해제",
      tone: "danger",
    });
    if (!ok) return;
    scopesSnapshot.current = scopes;
    setScopes((prev) => prev.filter((s) => s.id !== scopeId));
    void runFetch({
      url: `/api/scopes/${scopeId}`,
      method: "DELETE",
    });
  }

  return (
    <div className="mt-6 rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-fg">조문 단위 감시</h2>
        <span className="rounded-sm bg-subtle px-1.5 py-0.5 text-xs text-fg-secondary">
          {isFullDocumentMode ? "전체 조문" : `조문 ${scopes.length}개`}
        </span>
      </div>

      <p className="mt-2 text-sm text-fg-secondary">
        {isFullDocumentMode
          ? "조문을 선택하지 않으면 이 법령의 모든 개정에 대해 알림을 받습니다."
          : "선택한 조문이 변경될 때만 알림을 받습니다. 다른 조문은 무시."}
      </p>

      {scopes.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {scopes.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="text-sm text-fg">
                  {s.contentUnit.currentLabel ?? s.contentUnit.canonicalKey}
                </div>
                <div className="text-xs text-fg-muted">
                  {UNIT_TYPE_LABEL[s.contentUnit.unitType] ?? s.contentUnit.unitType} · {s.contentUnit.canonicalKey}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(s.id)}
                disabled={pending}
                className="whitespace-nowrap text-xs text-danger hover:underline disabled:opacity-50"
              >
                해제
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
        <select
          value={selectId}
          onChange={(e) => setSelectId(e.target.value)}
          disabled={pending || available.length === 0}
          className="flex-1 border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled select-field"
        >
          <option value="">
            {available.length === 0
              ? contentUnitOptions.length === 0
                ? "이 법령의 조문 정보가 없습니다"
                : "추가 가능한 조문이 없습니다"
              : "조문 선택..."}
          </option>
          {available.map((cu) => (
            <option key={cu.id} value={cu.id}>
              [{UNIT_TYPE_LABEL[cu.unitType] ?? cu.unitType}] {cu.currentLabel ?? cu.canonicalKey}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={pending || !selectId}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:bg-subtle disabled:text-fg-disabled"
        >
          {pending ? "추가 중..." : "추가"}
        </button>
      </div>
      {error && <p role="alert" aria-live="assertive" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
