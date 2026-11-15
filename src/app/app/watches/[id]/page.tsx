import {
  Badge,
  Breadcrumb,
  ButtonLink,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import { notFound } from "next/navigation";
import { requireUserContext } from "@/lib/auth/session";
import {
  getWatchDetail,
  listDepartmentOptions,
  listWorkspaceMemberOptions,
} from "@/lib/watches/queries";
import { listMappingsForWatch, listPolicies } from "@/lib/policies/queries";
import { listContentUnitsForDocument, listScopesForWatch } from "@/lib/watches/scopes";
import { WatchEditForm } from "./WatchEditForm";
import { PolicyMappingSection } from "./PolicyMappingSection";
import { formatKoreanDate } from "@/lib/format";
import { WatchScopeSection } from "./WatchScopeSection";
import { eventTypeLabel } from "@/lib/style";

export const dynamic = "force-dynamic";

export default async function WatchDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireUserContext();
  const watch = await getWatchDetail(ctx.workspaceId, params.id);
  if (!watch) notFound();

  const [memberOptions, departmentOptions, mappings, policyOptions, scopeData, contentUnits] = await Promise.all([
    listWorkspaceMemberOptions(ctx.workspaceId),
    listDepartmentOptions(ctx.workspaceId),
    listMappingsForWatch(ctx.workspaceId, watch.documentId),
    listPolicies(ctx.workspaceId),
    listScopesForWatch(ctx.workspaceId, watch.id),
    listContentUnitsForDocument(watch.documentId),
  ]);

  const isArchived = watch.status === "ARCHIVED";

  // 라운드 31: "최근 변경 이력" 에서 지금 시행 중인 건을 표시하기 위한 판정.
  // 목록은 detectedAt desc 라 맨 위가 곧 현재인 것은 아니다 — 이미 감지됐지만
  // 시행일이 미래인 개정이 위에 올 수 있다. 시행일이 오늘 이하인 것 중 가장
  // 최근 건이 "현재 시행 중".
  const today = new Date();
  const currentEventId =
    watch.document.changeEvents
      .filter((e) => e.effectiveDate !== null && e.effectiveDate <= today)
      .sort((a, b) => b.effectiveDate!.getTime() - a.effectiveDate!.getTime())[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: "관심 법령", href: "/app/watches" },
              { label: watch.document.currentTitle },
            ]}
          />
        }
        title={watch.document.currentTitle}
        description={
          <>
            {watch.document.documentType}
            {watch.document.currentAgencyName
              ? ` · ${watch.document.currentAgencyName}`
              : ""}
          </>
        }
        actions={
          <ButtonLink
            href={`/laws/${watch.document.externalDocumentId}`}
            variant="secondary"
          >
            법령 원문 보기
          </ButtonLink>
        }
      />

      {isArchived && (
        <div
          role="status"
          className="mb-6 rounded-md border border-line bg-subtle px-4 py-3 text-sm text-fg-secondary"
        >
          관심 해제된 법령입니다. 과거 기록은 유지되며, 법령 원문 페이지에서 다시
          등록할 수 있습니다.
        </div>
      )}

      <WatchEditForm
        watchId={watch.id}
        initial={{
          applicabilityStatus: watch.applicabilityStatus,
          applicabilityReason: watch.applicabilityReason ?? "",
          importance: watch.importance,
          ownerDepartmentId: watch.ownerDepartmentId,
          ownerMemberId: watch.ownerMemberId,
          reviewFrequencyMonths: watch.reviewFrequencyMonths ?? 0,
          lastReviewedAt: watch.lastReviewedAt?.toISOString() ?? null,
          nextReviewAt: watch.nextReviewAt?.toISOString() ?? null,
          notifyOnChange: watch.notifyOnChange,
          notifyEmail: watch.notifyEmail,
          status: watch.status,
        }}
        memberOptions={memberOptions}
        departmentOptions={departmentOptions}
      />

      <WatchScopeSection
        watchId={watch.id}
        scopes={scopeData.scopes}
        contentUnitOptions={contentUnits}
      />

      <PolicyMappingSection
        watchId={watch.id}
        mappings={mappings}
        policyOptions={policyOptions}
      />

      <section className="mt-8">
        <SectionHeader title="최근 변경 이력" />
        {watch.document.changeEvents.length === 0 ? (
          <p className="text-sm text-fg-secondary">아직 감지된 변경이 없습니다.</p>
        ) : (
          <ul className="space-y-2 text-base">
            {watch.document.changeEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 text-fg">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-fg-muted">{formatKoreanDate(e.detectedAt)}</span> · {eventTypeLabel(e.eventType)}
                  {/* 라운드 31: 날짜만 5줄 나열돼 있어 어느 게 지금 시행 중인지
                       사용자가 직접 비교해야 했다. 법령 상세 우측 패널의 "현재"
                       칩과 같은 규칙으로 표시한다. */}
                  {e.id === currentEventId && (
                    <Badge tone="primary">현재</Badge>
                  )}
                  {e.effectiveDate && e.effectiveDate > today && (
                    <Badge tone="neutral">시행 예정</Badge>
                  )}
                </span>
                {e.effectiveDate && (
                  <span className="whitespace-nowrap text-xs text-fg-muted">
                    시행 {formatKoreanDate(e.effectiveDate)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
