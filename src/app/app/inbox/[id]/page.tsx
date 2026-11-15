import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserContext } from "@/lib/auth/session";
import { formatKoreanDate as fmtDate } from "@/lib/format";
import { getInboxDetail } from "@/lib/inbox/queries";
import {
  listDepartmentOptions,
  listWorkspaceMemberOptions,
} from "@/lib/watches/queries";
import {
  INBOX_STATUS_HINT,
  INBOX_STATUS_LABEL,
  INBOX_STATUS_TONE,
  type InboxStatus,
} from "@/lib/inbox/labels";
import { openInboxItemAction } from "@/lib/inbox/actions";
import { InboxActionsPanel } from "./InboxActionsPanel";
import { articleAnchor } from "@/components/DiffCard";
import { ChangeMarkers } from "@/components/ui/change";
import { Icon } from "@/components/Icon";
import { CreateTaskFromInbox } from "./CreateTaskFromInbox";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/labels";
import {
  Badge,
  Breadcrumb,
  ButtonLink,
  PageHeader,
  Panel,
  SectionHeader,
} from "@/components/ui";
import { eventTypeLabel } from "@/lib/style";
import { RiskSummary } from "@/components/RiskBadge";
import { assessEventRisk } from "@/lib/risk/query";
import { getAffectedPolicies } from "@/lib/queries/affectedPolicies";
import { AffectedPoliciesPanel } from "@/components/AffectedPoliciesPanel";

export const dynamic = "force-dynamic";

export default async function InboxDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireUserContext();
  const item = await getInboxDetail(ctx.workspaceId, params.id);
  if (!item) notFound();

  // NEW → REVIEWING 자동 전환 (첫 조회 시)
  if (item.status === "NEW") {
    await openInboxItemAction(item.id);
  }

  const [memberOptions, departmentOptions, risk, affected] = await Promise.all([
    listWorkspaceMemberOptions(ctx.workspaceId),
    listDepartmentOptions(ctx.workspaceId),
    assessEventRisk(item.changeEvent.id),
    getAffectedPolicies(ctx.workspaceId, item.changeEvent.id),
  ]);

  const doc = item.changeEvent.document;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: "변경 알림", href: "/app/inbox" },
              { label: doc.currentTitle },
            ]}
          />
        }
        title={doc.currentTitle}
        description={
          <>
            {doc.documentType}
            {doc.currentAgencyName ? ` · ${doc.currentAgencyName}` : ""}
            {" · "}
            {eventTypeLabel(item.changeEvent.eventType)}
            {/* 배지 옆 title 툴팁은 터치 기기에서 안 뜬다. 지금 이 건이 어떤
                상태이고 그게 무슨 뜻인지 글자로 적는다. */}
            {INBOX_STATUS_HINT[item.status as InboxStatus] ? (
              <span className="mt-1.5 block text-sm text-fg-muted">
                {INBOX_STATUS_LABEL[item.status as InboxStatus]} —{" "}
                {INBOX_STATUS_HINT[item.status as InboxStatus]}
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <Badge
              tone={INBOX_STATUS_TONE[item.status as InboxStatus] ?? "neutral"}
              title={INBOX_STATUS_HINT[item.status as InboxStatus]}
            >
              {INBOX_STATUS_LABEL[item.status as InboxStatus] ?? item.status}
            </Badge>
            <ButtonLink
              href={`/laws/${doc.externalDocumentId}?event=${item.changeEvent.id}`}
              variant="secondary"
            >
              원문 개정 비교
            </ButtonLink>
          </>
        }
      />

      {/* 메타는 배지가 아니라 plain text + divider 로. 모든 값을 배지로 만들지 않는다. */}
      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-y border-line py-4 sm:grid-cols-4">
        <MetaField label="시행일" value={fmtDate(item.changeEvent.effectiveDate)} />
        <MetaField label="공포일" value={fmtDate(item.changeEvent.promulgationDate)} />
        <MetaField label="변경 조문" value={`${item.changeEvent.totalDiffCount}건`} />
        <MetaField label="감지일" value={fmtDate(item.changeEvent.detectedAt)} />
      </dl>

      <InboxActionsPanel
        inboxId={item.id}
        currentStatus={item.status as InboxStatus}
        initial={{
          applicability: item.applicability,
          applicabilityReason: item.applicabilityReason ?? "",
          impactLevel: item.impactLevel,
          assessmentText: item.assessmentText ?? "",
          ownerDepartmentId: item.ownerDepartmentId,
          assignedToMemberId: item.assignedToMemberId,
        }}
        memberOptions={memberOptions}
        departmentOptions={departmentOptions}
      />

      {/* 무엇이 바뀌었는지 나열하기 전에, 이게 급한 일인지부터 말한다.
          평가에서 가장 낮은 점수를 받은 축이 "업무에 도움이 됨"(4/10)이었고,
          원인이 "사실 나열만 있고 왜 중요한지가 없다" 였다. */}
      <div className="mt-8">
        <RiskSummary verdict={risk} canJudge />
      </div>

      {/* 급한지 다음으로 담당자가 알고 싶은 것은 "그래서 우리 어디를 고치나" 다.
          변경 내역을 나열하기 전에 답한다. */}
      <div className="mt-6">
        <AffectedPoliciesPanel data={affected} />
      </div>

      <section className="mt-6">
        <SectionHeader title="주요 변경 요약" />
        {item.changeEvent.diffs.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">본문 변경 없음 (부칙/타법 개정 가능성).</p>
        ) : (
          <div className="mt-3 space-y-2">
            {/* 4타입 요약 — 글리프 + 낱말 + 수. 색만으로 구분하지 않는다. */}
            <ChangeMarkers
              counts={{
                added: countDiffs(item.changeEvent.diffs, "ADDED"),
                modified: countDiffs(item.changeEvent.diffs, "MODIFIED"),
                deleted: countDiffs(item.changeEvent.diffs, "DELETED"),
                moved: countDiffs(item.changeEvent.diffs, "MOVED"),
              }}
              className="gap-3"
            />
            {/* 사용성 테스트: 이 목록을 눌러도 아무 반응이 없어 "조문 이동이
                 안 된다"는 지적을 받았다. 실제로 <li> 안에 링크가 없었다.
                 각 항목을 해당 조문 앵커로 바로 보내도록 링크로 바꾼다. */}
            <ul className="mt-3 divide-y divide-line">
              {item.changeEvent.diffs.slice(0, 10).map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/laws/${doc.externalDocumentId}?event=${item.changeEvent.id}#${articleAnchor(d.contentUnitId ?? d.id)}`}
                    className="flex items-center gap-2 rounded px-1 py-2 transition-colors duration-swift hover:bg-hover"
                  >
                    <span className="w-16 shrink-0 text-xs text-fg-muted">
                      {diffTypeLabel(d.changeType)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-legal text-legal text-fg">
                      {d.newLabel ?? d.oldLabel ?? "—"}
                    </span>
                    <Icon
                      name="chevron-right"
                      size={14}
                      className="shrink-0 text-fg-disabled"
                    />
                  </Link>
                </li>
              ))}
            </ul>
            {item.changeEvent.diffs.length > 10 ? (
              <p className="text-sm text-fg-muted">
                외 {item.changeEvent.totalDiffCount - 10}건이 더 있습니다.
              </p>
            ) : null}
            <p className="text-sm text-fg-muted">
              전체 조문별 비교는{" "}
              <Link href={`/laws/${doc.externalDocumentId}?event=${item.changeEvent.id}`} className="text-primary-text hover:underline">원문 개정 비교</Link>
              에서 볼 수 있습니다.
            </p>
          </div>
        )}
      </section>

      <section className="mt-8">
        <SectionHeader
          title={`연결된 업무 ${item.tasks.length}`}
          actions={
            !["DONE", "DISMISSED"].includes(item.status) ? (
              <CreateTaskFromInbox
                inboxId={item.id}
                suggestedTitle={`${doc.currentTitle} 대응 조치`}
                defaultPriority={mapImpactToTaskPriority(item.impactLevel) as TaskPriority}
              />
            ) : null
          }
        />

        {item.tasks.length === 0 ? (
          <p className="text-sm text-fg-secondary">
            아직 등록된 업무가 없습니다. 필요한 조치를 업무로 만들어 관리하세요.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {item.tasks.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/app/tasks/${t.id}`} className="text-base font-medium text-fg hover:text-primary-text">
                      {t.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
                      <Badge tone={TASK_STATUS_TONE[t.status as TaskStatus] ?? "neutral"}>
                        {TASK_STATUS_LABEL[t.status as TaskStatus] ?? t.status}
                      </Badge>
                      <Badge tone={TASK_PRIORITY_TONE[t.priority as TaskPriority] ?? "neutral"}>
                        {TASK_PRIORITY_LABEL[t.priority as TaskPriority] ?? t.priority}
                      </Badge>
                      {t.dueAt && <span>마감 {fmtDate(t.dueAt)}</span>}
                      {t._count.evidence > 0 && <span>증빙 {t._count.evidence}건</span>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {item.watch && (
        <Panel className="mt-8 p-4 text-sm text-fg-secondary">
          이 항목은{" "}
          <Link href={`/app/watches/${item.watch.id}`} className="text-primary-text hover:underline">
            관심 법령 등록
          </Link>{" "}
          으로부터 생성되었습니다.
        </Panel>
      )}
    </div>
  );
}

// Inbox 의 impactLevel → Task 기본 우선순위 힌트.
function mapImpactToTaskPriority(impact: string | null): string {
  switch (impact) {
    case "CRITICAL": return "URGENT";
    case "HIGH":     return "HIGH";
    case "LOW":      return "LOW";
    default:         return "NORMAL";
  }
}

function MetaField({ label, value }: { label: string; value: string }) {
  // 라운드 30-7: 메타 필드 위계 강화. 라벨은 caption(옅게), 값은 font-medium (bold-이라 하기엔 무겁고 medium 이 적당).
  return (
    <div>
      <dt className="text-xs text-fg-secondary">{label}</dt>
      <dd className="mt-1 font-medium text-fg">{value}</dd>
    </div>
  );
}

function countDiffs(diffs: Array<{ changeType: string }>, kind: string): number {
  return diffs.filter((d) => d.changeType === kind).length;
}

function diffTypeLabel(t: string): string {
  switch (t) {
    case "ADDED": return "신설";
    case "MODIFIED": return "개정";
    case "DELETED": return "삭제";
    case "MOVED": return "이동";
    case "TITLE_CHANGED": return "제목 변경";
    case "EFFECTIVE_DATE_CHANGED": return "시행일 변경";
    default: return t;
  }
}

