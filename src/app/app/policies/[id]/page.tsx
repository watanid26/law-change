// 사규 상세 — 본문을 넣고, 근거 법령을 연결하는 곳.
//
// 지금까지 사규는 목록만 있었다. 그래서 8건을 등록해 놓고 법령과 연결한
// 것이 한 건도 없었다. 연결이 없으면 개정이 와도 "우리 어디를 고쳐야 하나"
// 에 답할 수 없다. 이 화면이 그 연결을 만드는 자리다.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserContext } from "@/lib/auth/session";
import { getPolicyDetail } from "@/lib/policies/detailQuery";
import { POLICY_TYPE_LABEL, type PolicyType } from "@/lib/policies/labels";
import { PageHeader, Panel, EmptyState } from "@/components/ui";
import { PolicyContentForm } from "./PolicyContentForm";
import { CandidateList, RemoveMappingButton } from "./CandidateList";

export const dynamic = "force-dynamic";

export default async function PolicyDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireUserContext();
  const policy = await getPolicyDetail(ctx.workspaceId, params.id);
  if (!policy) notFound();

  return (
    <>
      <PageHeader
        title={policy.title}
        description={POLICY_TYPE_LABEL[policy.type as PolicyType] ?? policy.type}
        meta={`연결된 법령 ${policy.mappings.length.toLocaleString("ko-KR")}건`}
        actions={
          policy.externalUrl ? (
            <a
              href={policy.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-text underline underline-offset-2 hover:no-underline"
            >
              원문 열기
            </a>
          ) : null
        }
      />

      <Panel>
        <div className="p-4">
          <PolicyContentForm
            policyId={policy.id}
            initialText={policy.contentText}
            savedAt={policy.contentSavedAt}
          />
        </div>
      </Panel>

      <CandidateList policyId={policy.id} candidates={policy.candidates} />

      <section className="mt-8">
        <h2 className="text-base font-semibold text-fg">
          연결된 법령 {policy.mappings.length}건
        </h2>
        {policy.mappings.length === 0 ? (
          <Panel>
            <EmptyState
              icon="git-compare"
              title="아직 연결된 법령이 없습니다"
              description={
                policy.contentText
                  ? "위에서 찾은 근거 법령을 연결하면 해당 조문이 개정될 때 이 사규가 함께 표시됩니다."
                  : "사규 본문을 넣으면 근거 법령을 찾아 연결 후보로 보여드립니다."
              }
            />
          </Panel>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
            {policy.mappings.map((m) => (
              <li key={m.mappingId} className="flex items-start justify-between gap-4 p-3.5">
                <div className="min-w-0">
                  <Link
                    href={`/laws/${m.externalDocumentId}`}
                    className="text-sm font-medium text-fg hover:text-primary-text"
                  >
                    {m.documentTitle}
                  </Link>
                  {m.unitLabel ? (
                    <span className="ml-1.5 text-sm text-fg-secondary">
                      {m.unitLabel}
                      {m.unitTitle ? `(${m.unitTitle})` : ""}
                    </span>
                  ) : (
                    // 조문을 특정하지 않은 연결은 개정 때 노이즈가 된다.
                    // 숨기지 않고 그렇다고 밝힌다.
                    <span className="ml-1.5 text-xs text-fg-muted">법령 전체</span>
                  )}
                  {m.lastChangeAt ? (
                    <p className="mt-1 text-xs text-fg-muted tabular">
                      최근 개정 {m.lastChangeAt}
                    </p>
                  ) : null}
                </div>
                <RemoveMappingButton mappingId={m.mappingId} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
