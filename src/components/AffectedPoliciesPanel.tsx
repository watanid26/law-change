import Link from "next/link";
import type { AffectedPoliciesResult } from "@/lib/queries/affectedPolicies";
import { POLICY_TYPE_LABEL, type PolicyType } from "@/lib/policies/labels";

const CHANGE_LABEL: Record<string, string> = {
  ADDED: "신설",
  MODIFIED: "개정",
  DELETED: "삭제",
  MOVED: "이동",
};

// 이 개정이 우리 사규 어디를 건드리는지.
//
// 법제처도 "법이 바뀌었다" 는 알려준다. 이 블록이 그다음 질문에 답한다 —
// "그래서 우리 규정 어디를 고쳐야 하나". 담당자가 이 화면에서 실제로
// 알고 싶은 것이 이것이다.
export function AffectedPoliciesPanel({ data }: { data: AffectedPoliciesResult }) {
  const { direct, indirect, changedUnitCount, mappedUnitCount } = data;

  // 연결이 하나도 없으면 조용히 사라지지 않고, 왜 비었는지와 무엇을 하면
  // 되는지를 말한다. 연결은 사람이 한 번 해줘야 쌓인다.
  if (direct.length === 0 && indirect.length === 0) {
    return (
      <section className="rounded-md border border-line bg-subtle p-4">
        <p className="text-sm font-medium text-fg">이 개정과 연결된 사규가 없습니다</p>
        <p className="mt-1 text-sm text-fg-secondary">
          사규 본문을 등록하고 근거 법령을 연결해 두면, 그 조문이 개정될 때 어느
          규정을 고쳐야 하는지 이 자리에 표시됩니다.
        </p>
        <Link
          href="/app/policies"
          className="mt-2 inline-block text-sm text-primary-text underline underline-offset-2 hover:no-underline"
        >
          내부 사규 관리로
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-line bg-surface p-4">
      <p className="text-sm font-medium text-fg">
        바뀐 조문 {changedUnitCount}개 중 {mappedUnitCount}개가 귀사 사규와 연결돼 있습니다
      </p>

      {direct.length > 0 ? (
        <ul className="mt-3 space-y-2.5">
          {direct.map((p, i) => (
            <li key={`${p.policyId}-${p.viaUnitLabel ?? i}`} className="flex items-baseline gap-2">
              <span className="shrink-0 text-sm text-fg-secondary tabular">
                {p.viaUnitLabel}
                {p.viaUnitTitle ? `(${p.viaUnitTitle})` : ""}
              </span>
              <span className="shrink-0 text-fg-muted">→</span>
              <span className="min-w-0">
                <Link
                  href={`/app/policies/${p.policyId}`}
                  className="text-sm font-medium text-fg hover:text-primary-text"
                >
                  {p.policyTitle}
                </Link>
                <span className="ml-1.5 text-xs text-fg-muted">
                  {POLICY_TYPE_LABEL[p.policyType as PolicyType] ?? p.policyType}
                  {p.ownerDepartmentName ? ` · ${p.ownerDepartmentName}` : ""}
                  {p.changeType ? ` · ${CHANGE_LABEL[p.changeType] ?? p.changeType}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {indirect.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          {/* 법령 단위 연결은 조문을 특정하지 않아 관련 여부를 사람이 봐야
              한다. 위의 확실한 것과 섞으면 목록 전체의 신뢰가 떨어진다. */}
          <p className="text-xs text-fg-muted">
            법령 단위로 연결돼 있어 관련 여부를 확인해야 하는 사규 {indirect.length}건
          </p>
          <ul className="mt-1.5 space-y-1">
            {indirect.map((p) => (
              <li key={p.policyId}>
                <Link
                  href={`/app/policies/${p.policyId}`}
                  className="text-sm text-fg-secondary hover:text-primary-text"
                >
                  {p.policyTitle}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
