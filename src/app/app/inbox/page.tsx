// 변경 내역 — "검토해야 할 변경을 처리하는 공간".
//
// 제2판은 7열 와이드 테이블이었다. 법령명·상태·적용여부·영향도·담당자·시행일·
// 감지일이 모두 같은 비중으로 놓여서, 무엇부터 손대야 하는지 읽히지 않았다.
// 제3판은 리스트로 바꾸고 위계를 셋으로 정리한다.
//   법령명(가장 큼) → 무엇이 바뀌었나(보조) → 언제까지인가(우측 정렬)
//
// 쿼리 파라미터(q / status / applicability / page)와 필터 의미는 그대로다.
// 상태 select 를 탭으로 바꿨을 뿐, 넘기는 값은 동일한 enum 이다.

import { requireUserContext } from "@/lib/auth/session";
import { formatKoreanDate } from "@/lib/format";
import {
  countInboxByStatus,
  listInboxMinistries,
  listInboxItems,
  type InboxListItem,
} from "@/lib/inbox/queries";
import {
  INBOX_APPLICABILITY_LABEL,
  INBOX_APPLICABILITY_VALUES,
  INBOX_STATUS_HINT,
  INBOX_STATUS_LABEL,
  INBOX_STATUS_TONE,
  INBOX_OPEN_STATUSES,
  INBOX_STATUS_VALUES,
  IMPACT_LEVEL_LABEL,
  IMPACT_LEVEL_TONE,
  type InboxStatus,
} from "@/lib/inbox/labels";
import { eventTypeLabel } from "@/lib/style";
import { Icon } from "@/components/Icon";
import { changeSummaryLabel } from "@/lib/laws/changeSummary";
import { DDay } from "@/components/ui/dday";
import { ComboSelect } from "@/components/ComboSelect";
import { listWorkspaceMemberOptions } from "@/lib/watches/queries";
import { InboxRowActions } from "./InboxRowActions";
import { RiskBadge } from "@/components/RiskBadge";
import { assessEventRisks } from "@/lib/risk/query";
import type { RiskLevel } from "@/lib/risk/changeRisk";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  FilterBar,
  FilterSelect,
  LinkTabs,
  PageHeader,
  Panel,
  Pagination,
  SearchInput,
  cx,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface Props {
  searchParams: {
    q?: string;
    status?: string;
    applicability?: string;
    ministry?: string;
    page?: string;
  };
}

export default async function InboxPage({ searchParams }: Props) {
  const ctx = await requireUserContext();

  const search = searchParams.q?.trim() || undefined;
  const status = searchParams.status?.trim() || undefined;
  const applicability = searchParams.applicability?.trim() || undefined;
  const ministry = searchParams.ministry?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [{ items, total }, statusCounts, ministries, memberOptions] = await Promise.all([
    listInboxItems({
      workspaceId: ctx.workspaceId,
      status,
      applicability,
      ministry,
      search,
      limit: PAGE_SIZE,
      offset,
    }),
    countInboxByStatus(ctx.workspaceId, { search, applicability, ministry }),
    listInboxMinistries(ctx.workspaceId),
    listWorkspaceMemberOptions(ctx.workspaceId),
  ]);

  // 목록 카드에 "사실 나열만 있다" 는 지적을 받은 자리. 한 번의 조회로
  // 이 페이지의 이벤트를 모두 판정한다(이벤트당 평균 12행).
  const risks = await assessEventRisks(items.map((i) => i.changeEventId));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (over: Record<string, string | undefined>) => {
    const usp = new URLSearchParams();
    const merged = {
      q: search,
      status,
      applicability,
      ministry,
      page: page > 1 ? String(page) : undefined,
      ...over,
    };
    for (const [k, val] of Object.entries(merged)) if (val) usp.set(k, val);
    const str = usp.toString();
    return str ? `/app/inbox?${str}` : "/app/inbox";
  };

  const tabs = [
    // "진행 중" 만 숫자 배지가 없어서, 옆의 6개와 나란히 놓이면 이 탭만
    // 성격이 다른 것처럼 보였다. 열린 상태들의 합이 곧 이 탭의 건수다.
    {
      href: qs({ status: undefined, page: undefined }),
      label: "진행 중",
      count: INBOX_OPEN_STATUSES.reduce((n, v) => n + (statusCounts[v] ?? 0), 0),
      active: !status,
    },
    ...INBOX_STATUS_VALUES.map((v) => ({
      href: qs({ status: v, page: undefined }),
      label: INBOX_STATUS_LABEL[v],
      count: statusCounts[v] ?? 0,
      active: status === v,
    })),
  ];

  const hasFilters = Boolean(search || applicability || ministry);

  return (
    <>
      <PageHeader
        title="변경 알림"
        /* 상태 이름만으로는 "지금 내가 뭘 해야 하는지" 가 안 읽힌다는 지적을
           받아 INBOX_STATUS_HINT 를 만들어 뒀는데, 배지의 title 툴팁으로만
           달아서 터치 기기에서는 뜨지 않고 평가자도 끝내 못 봤다.
           탭을 고르면 그 상태의 뜻을 여기에 글자로 적는다. */
        description={
          status && INBOX_STATUS_HINT[status as InboxStatus]
            ? `${INBOX_STATUS_LABEL[status as InboxStatus]} — ${INBOX_STATUS_HINT[status as InboxStatus]}`
            : "관리 중인 법령에서 감지된 변경을 검토하고 처리합니다. 시행일이 가까운 것부터 보여줍니다."
        }
        meta={`${total.toLocaleString("ko-KR")}건`}
        actions={
          <a href="/api/export/inbox" className="contents">
            <Button variant="secondary" type="button">
              <Icon name="download" size={15} />
              내보내기
            </Button>
          </a>
        }
      />

      {/* 탭과 개별 항목 배지가 같은 낱말을 쓴다("신규","검토 중"…).
           탭은 필터, 배지는 그 항목의 상태다. 상위 라벨로 역할을 구분해 준다. */}
      <p className="mb-1.5 text-xs font-medium text-fg-muted">상태별 보기</p>
      <LinkTabs items={tabs} className="mb-4" />

      <FilterBar action="/app/inbox">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <SearchInput
          name="q"
          defaultValue={search ?? ""}
          placeholder="법령명 검색"
          aria-label="법령명 검색"
          wrapperClassName="max-w-sm"
        />
        <FilterSelect
          name="applicability"
          defaultValue={applicability ?? ""}
          aria-label="적용 여부"
        >
          <option value="">적용 여부 전체</option>
          {INBOX_APPLICABILITY_VALUES.map((v) => (
            <option key={v} value={v}>
              {INBOX_APPLICABILITY_LABEL[v]}
            </option>
          ))}
        </FilterSelect>
        {/* 소관부처 필터. 데이터(ministry)는 원래 목록에 찍히고 있었는데
            이 화면에만 필터가 없었다 — "법령 찾기" 에는 있고 정작 매일 보는
            화면에는 없는 상태였다. 전체 310개가 아니라 내 인박스에 실제로
            있는 부처만 보여준다. 고르면 반드시 결과가 있다. */}
        {ministries.length > 1 ? (
          <ComboSelect
            name="ministry"
            value={ministry ?? ""}
            placeholder="소관부처 전체"
            options={ministries}
          />
        ) : null}
        <Button type="submit" variant="secondary">
          필터 적용
        </Button>
        {hasFilters ? (
          <ButtonLink
            href={qs({ q: undefined, applicability: undefined, ministry: undefined, page: undefined })}
            variant="ghost"
          >
            초기화
          </ButtonLink>
        ) : null}
      </FilterBar>

      <div className="mt-5">
        {items.length === 0 ? (
          <Panel>
            {hasFilters || status ? (
              <EmptyState
                icon="search"
                title="조건에 맞는 변경이 없습니다"
                description="검색어나 필터를 조정해 보세요."
                action={
                  <ButtonLink href="/app/inbox" variant="secondary" size="sm">
                    필터 초기화
                  </ButtonLink>
                }
                compact
              />
            ) : (
              <EmptyState
                icon="bell"
                title="아직 감지된 변경이 없습니다"
                description="관심 법령을 등록하면 개정이 감지될 때 여기에 모입니다."
                action={
                  <ButtonLink href="/app/watches" variant="primary" size="sm">
                    관심 법령 보기
                  </ButtonLink>
                }
              />
            )}
          </Panel>
        ) : (
          <Panel className="divide-y divide-line overflow-hidden">
            {items.map((r) => (
              <InboxRow
                key={r.id}
                item={r}
                members={memberOptions}
                risk={risks.get(r.changeEventId)?.level ?? "none"}
              />
            ))}
          </Panel>
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        buildHref={(p) => qs({ page: p > 1 ? String(p) : undefined })}
      />
    </>
  );
}

/* ── 한 행 ────────────────────────────────────────────────────────
 * 좌: 법령명 + 상태 / 무엇이 바뀌었나
 * 우: 시행일 D-day / 담당자 · 감지일
 * 행을 카드로 감싸지 않고 divider 로만 나눈다. */
function InboxRow({
  item,
  members,
  risk,
}: {
  item: InboxListItem;
  members: { id: string; label: string }[];
  risk: RiskLevel;
}) {
  const status = item.status as InboxStatus;
  // 상세를 열면 신규→검토 중으로 자동 전환되므로 NEW 는 곧 "아직 안 본 것".
  const unread = status === "NEW";

  // 행 전체를 <a> 로 감싸고 있었다. 그러면 안에 select 를 넣을 수 없다
  // (중첩된 상호작용 요소는 유효하지 않고 클릭도 서로 잡아먹는다).
  // 제목 영역만 링크로 두고, 퀵 액션은 링크 밖에 놓는다.
  return (
    <div className="flex flex-col gap-3 px-4 py-4 transition-colors duration-swift hover:bg-hover sm:flex-row sm:items-start sm:gap-6 sm:px-5">
      {/* 안 본 항목 표식. 색만으로 전달하지 않도록 상태 배지와 항상 함께 둔다. */}
      <span
        aria-hidden="true"
        className={cx(
          "mt-1.5 hidden h-2 w-2 shrink-0 rounded-full sm:block",
          unread ? "bg-primary" : "bg-transparent",
        )}
      />
      <a href={`/app/inbox/${item.id}`} className="min-w-0 flex-1 rounded-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cx(
              "font-legal text-legal text-fg",
              unread ? "font-bold" : "font-bold opacity-95",
            )}
          >
            {item.documentTitle}
          </span>
          <Badge
            tone={INBOX_STATUS_TONE[status] ?? "neutral"}
            title={INBOX_STATUS_HINT[status]}
          >
            {INBOX_STATUS_LABEL[status] ?? item.status}
          </Badge>
          {/* 문서가 말하는 신호. 사람이 고르는 영향도와 다른 축이라
              덮어쓰지 않고 나란히 놓는다. */}
          <RiskBadge level={risk} />
          {item.impactLevel ? (
            <Badge tone={IMPACT_LEVEL_TONE[item.impactLevel] ?? "neutral"}>
              영향도 {IMPACT_LEVEL_LABEL[item.impactLevel] ?? item.impactLevel}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-fg-secondary">
          {eventTypeLabel(item.eventType)} ·{" "}
          {item.totalDiffCount > 0 || !item.hasPrevious ? (
            changeSummaryLabel(item)
          ) : (
            <span title="부칙만 개정되었거나 타법 개정에 따른 형식적 반영일 가능성이 큽니다.">
              본문 변경 없음
            </span>
          )}
          {item.ministry ? ` · ${item.ministry}` : ""}
        </p>
      </a>

      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
          <DDay date={item.effectiveDate} />
          <span className="text-xs text-fg-muted">
            {formatKoreanDate(item.detectedAt)} 감지
          </span>
        </div>
        {/* 협업 기능은 원래 다 있었다 — 다만 쓰려면 매번 상세에 들어가야 했다.
            하루에 여러 건을 훑으며 담당자를 배분하는 실무에서는 그 클릭
            하나가 체감 속도를 크게 가른다. 여기서 바로 하게 한다. */}
        <InboxRowActions
          inboxId={item.id}
          status={status}
          assignedMemberId={item.assignedMemberId}
          members={members}
        />
      </div>
    </div>
  );
}
