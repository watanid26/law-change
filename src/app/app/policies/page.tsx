// 내부 사규 — 문서 관리 제품처럼. card grid 대신 clean list.
//
// 제2판은 3열 테이블(제목/종류/외부링크)이었다. "열기 →" 링크가 별도 컬럼을
// 차지해서 표가 넓어졌고, 정작 사규 이름은 다른 값들과 같은 무게였다.
// 제3판은 리스트로 바꾸고 제목을 최우선에 둔다.

import Link from "next/link";
import { requireUserContext } from "@/lib/auth/session";
import { listPolicies } from "@/lib/policies/queries";
import { POLICY_TYPE_LABEL, type PolicyType } from "@/lib/policies/labels";
import { CreatePolicyForm } from "./CreatePolicyForm";
import { BulkImportForm } from "./BulkImportForm";
import { Icon } from "@/components/Icon";
import { EmptyState, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const ctx = await requireUserContext();
  const policies = await listPolicies(ctx.workspaceId);

  return (
    <>
      <PageHeader
        title="내부 사규"
        description="조직 내부 규정과 외부 법령의 연결 관계를 관리합니다."
        meta={`${policies.length.toLocaleString("ko-KR")}건`}
        actions={
          <>
            <BulkImportForm />
            <CreatePolicyForm />
          </>
        }
      />

      {policies.length === 0 ? (
        <Panel>
          <EmptyState
            icon="file-text"
            title="등록된 내부 사규가 없습니다"
            description="사규·지침을 등록하면 관심 법령 상세에서 해당 사규와 연결할 수 있습니다."
          />
        </Panel>
      ) : (
        <Panel className="divide-y divide-line overflow-hidden">
          {policies.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-4 px-4 py-4 transition-colors duration-swift hover:bg-hover sm:px-5"
            >
              <div className="min-w-0">
                {/* 상세로 들어가야 본문을 넣고 근거 법령을 연결할 수 있다.
                    목록만 있던 동안 8건 등록에 연결 0건이었다. */}
                <Link
                  href={`/app/policies/${p.id}`}
                  className="text-base font-medium text-fg hover:text-primary-text"
                >
                  {p.title}
                </Link>
                <div className="mt-0.5 text-sm text-fg-muted">
                  {POLICY_TYPE_LABEL[p.type as PolicyType] ?? p.type}
                </div>
              </div>
              {p.externalUrl ? (
                <a
                  href={p.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-sm text-fg-secondary hover:text-primary-text"
                >
                  원문 열기
                  <Icon name="external-link" size={13} />
                </a>
              ) : null}
            </div>
          ))}
        </Panel>
      )}

      <p className="mt-5 text-sm text-fg-muted">
        <Link href="/app/watches" className="text-primary-text hover:underline">
          관심 법령
        </Link>{" "}
        의 각 법령 상세에서 여기 등록된 사규를 연결할 수 있습니다.
      </p>
    </>
  );
}
