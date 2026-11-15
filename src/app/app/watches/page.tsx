// 적용법규 — 이 화면은 table 이 맞다. 여러 법령의 상태를 같은 축으로
// 비교하는 것이 업무 자체이기 때문. 다만 표 자체를 현대화한다.
//   · 두꺼운 테두리 상자에 가두지 않는다 (세로 컬럼 구분선 없음, striped 없음)
//   · 법령명이 시각적 최우선. 나머지는 12~13px
//   · row height 는 넉넉하게, divider 는 hairline
//
// 쿼리 파라미터(q / applicability / importance / page)는 그대로다.

import { requireUserContext } from "@/lib/auth/session";
import {
  listWatches,
  nextWatchSort,
  parseWatchSort,
  type WatchSortKey,
} from "@/lib/watches/queries";
import { formatKoreanDate } from "@/lib/format";
import {
  APPLICABILITY_LABEL,
  APPLICABILITY_TONE,
  APPLICABILITY_VALUES,
  IMPORTANCE_LABEL,
  IMPORTANCE_TONE,
  IMPORTANCE_VALUES,
} from "@/lib/watches/labels";
import { anyPresent } from "@/lib/table";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  EmptyCell,
  EmptyState,
  FilterBar,
  FilterSelect,
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
    applicability?: string;
    importance?: string;
    sort?: string;
    page?: string;
  };
}

export default async function WatchesPage({ searchParams }: Props) {
  const ctx = await requireUserContext();

  const search = searchParams.q?.trim() || undefined;
  const applicability = searchParams.applicability?.trim() || undefined;
  const importance = searchParams.importance?.trim() || undefined;
  const sort = parseWatchSort(searchParams.sort);
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { items, total } = await listWatches({
    workspaceId: ctx.workspaceId,
    search,
    applicability,
    importance,
    sort,
    limit: PAGE_SIZE,
    offset,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 현재 페이지 전체가 비어 있는 선택 컬럼은 숨긴다.
  // (적용 여부·중요도는 워크플로 상태라 대상이 아니다.)
  const showMinistry = anyPresent(items, (w) => w.ministry);
  const showOwner = anyPresent(
    items,
    (w) => w.ownerMemberDisplayName ?? w.ownerDepartmentName,
  );
  const showNextReview = anyPresent(items, (w) => w.nextReviewAt);

  const qs = (over: Record<string, string | undefined>) => {
    const usp = new URLSearchParams();
    const merged = {
      q: search,
      applicability,
      importance,
      sort: searchParams.sort,
      page: page > 1 ? String(page) : undefined,
      ...over,
    };
    for (const [k, val] of Object.entries(merged)) if (val) usp.set(k, val);
    const str = usp.toString();
    return str ? `/app/watches?${str}` : "/app/watches";
  };
  const hasFilters = Boolean(search || applicability || importance);

  /* 헤더가 정렬 가능한 모양인데 실제로는 눌러도 순서가 안 바뀌었다.
     진짜 링크로 만들고, 지금 어느 축으로 정렬돼 있는지도 표시한다.
     정렬을 바꾸면 페이지는 1로 되돌린다 — 3페이지에서 축을 바꾸면 그 3페이지는
     이제 다른 목록의 3페이지라 아무 뜻이 없다. */
  function SortHeader({
    sortKey,
    label,
    className,
  }: {
    sortKey: WatchSortKey;
    label: string;
    className?: string;
  }) {
    const active = sort.key === sortKey;
    return (
      <th
        scope="col"
        className={className}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <Link
          href={qs({ sort: nextWatchSort(sort, sortKey), page: undefined })}
          className={cx(
            "group inline-flex items-center gap-1 rounded-sm px-4 py-2.5 transition-colors duration-swift sm:px-5",
            // 어느 열로 정렬돼 있는지 표시가 약했다. 비활성 열에도 같은 회색
            // 셰브런이 붙어 있어서 넷 다 똑같아 보였다. 활성 열만 글자를
            // 진하게 + 셰브런에 색을 주고, 나머지는 hover 때만 보여준다.
            active
              ? "font-semibold text-fg"
              : "font-medium hover:text-fg",
          )}
        >
          {label}
          <Icon
            name={active && sort.dir === "asc" ? "chevron-up" : "chevron-down"}
            size={12}
            aria-hidden="true"
            className={cx(
              "shrink-0",
              active
                ? "text-primary"
                : "text-fg-disabled opacity-0 transition-opacity duration-swift group-hover:opacity-100",
            )}
          />
        </Link>
      </th>
    );
  }

  return (
    <>
      <PageHeader
        title="관심 법령"
        description="우리 조직에 적용되는 법령과 검토 상태를 관리합니다."
        meta={`관리 법령 ${total.toLocaleString("ko-KR")}개`}
        actions={
          <>
            <a href="/api/export/watches" className="contents">
              <Button variant="secondary" type="button">
                <Icon name="download" size={15} />
                내보내기
              </Button>
            </a>
            <ButtonLink href="/laws" variant="primary">
              <Icon name="plus" size={15} />
              법령 추가
            </ButtonLink>
          </>
        }
      />

      <FilterBar action="/app/watches">
        <SearchInput
          name="q"
          defaultValue={search ?? ""}
          placeholder="법령명 · 소관기관 검색"
          aria-label="법령명 또는 소관기관 검색"
          wrapperClassName="max-w-sm"
        />
        <FilterSelect
          name="applicability"
          defaultValue={applicability ?? ""}
          aria-label="적용 여부"
        >
          <option value="">적용 여부 전체</option>
          {APPLICABILITY_VALUES.map((v) => (
            <option key={v} value={v}>
              {APPLICABILITY_LABEL[v]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          name="importance"
          defaultValue={importance ?? ""}
          aria-label="중요도"
        >
          <option value="">중요도 전체</option>
          {IMPORTANCE_VALUES.map((v) => (
            <option key={v} value={v}>
              {IMPORTANCE_LABEL[v]}
            </option>
          ))}
        </FilterSelect>
        <Button type="submit" variant="secondary">
          필터 적용
        </Button>
        {hasFilters ? (
          <ButtonLink href="/app/watches" variant="ghost">
            초기화
          </ButtonLink>
        ) : null}
      </FilterBar>

      <div className="mt-5">
        {items.length === 0 ? (
          <Panel>
            {hasFilters ? (
              <EmptyState
                icon="search"
                title="조건에 맞는 법령이 없습니다"
                description="검색어나 필터를 조정해 보세요."
                action={
                  <ButtonLink href="/app/watches" variant="secondary" size="sm">
                    필터 초기화
                  </ButtonLink>
                }
                compact
              />
            ) : (
              <EmptyState
                icon="bookmark"
                title="등록된 적용 법령이 없습니다"
                description="관리할 법령을 추가하면 변경 사항을 자동으로 추적할 수 있습니다."
                action={
                  <ButtonLink href="/laws" variant="primary" size="sm">
                    법령 추가
                  </ButtonLink>
                }
              />
            )}
          </Panel>
        ) : (
          <Panel className="overflow-hidden">
            <p className="border-b border-line px-4 py-2 text-xs text-fg-muted md:hidden">
              좌우로 밀어 담당자·검토일을 확인하세요
            </p>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-medium text-fg-muted">
                    <SortHeader sortKey="title" label="법령" />
                    {showMinistry ? (
                      <SortHeader sortKey="ministry" label="소관기관" className="whitespace-nowrap" />
                    ) : null}
                    <SortHeader sortKey="applicability" label="적용 여부" className="whitespace-nowrap" />
                    <SortHeader sortKey="importance" label="중요도" className="whitespace-nowrap" />
                    {/* 담당자는 이름·부서 두 출처가 섞여 있어 정렬 축이 하나로
                        안 정해진다. 정렬 가능한 것처럼 보이지 않게 그냥 둔다. */}
                    {showOwner ? (
                      <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">담당자</th>
                    ) : null}
                    {showNextReview ? (
                      <SortHeader sortKey="review" label="다음 검토" className="whitespace-nowrap" />
                    ) : null}
                    <SortHeader sortKey="change" label="최근 변경" className="whitespace-nowrap" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((w) => (
                    <tr
                      key={w.id}
                      className="group transition-colors duration-swift hover:bg-hover"
                    >
                      <td className="px-4 py-4 sm:px-5">
                        <a
                          href={`/app/watches/${w.id}`}
                          className="font-legal text-legal font-bold text-fg group-hover:text-primary-text"
                        >
                          {w.documentTitle}
                        </a>
                        <div className="mt-0.5 text-xs text-fg-muted">
                          {w.documentType}
                        </div>
                      </td>
                      {showMinistry ? (
                        <td className="max-w-[200px] px-4 py-4 text-sm text-fg-secondary">
                          {w.ministry ? (
                            <span className="line-clamp-2" title={w.ministry}>
                              {w.ministry}
                            </span>
                          ) : (
                            <EmptyCell />
                          )}
                        </td>
                      ) : null}
                      <td className="px-4 py-4">
                        <Badge tone={APPLICABILITY_TONE[w.applicabilityStatus] ?? "neutral"}>
                          {APPLICABILITY_LABEL[w.applicabilityStatus] ?? w.applicabilityStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone={IMPORTANCE_TONE[w.importance] ?? "neutral"}>
                          {IMPORTANCE_LABEL[w.importance] ?? w.importance}
                        </Badge>
                      </td>
                      {showOwner ? (
                        <td className="px-4 py-4 text-sm text-fg-secondary">
                          {w.ownerMemberDisplayName ? (
                            <span className="flex items-center gap-2">
                              <Avatar name={w.ownerMemberDisplayName} size={22} />
                              <span className="min-w-0">
                                <span className="block truncate text-fg">
                                  {w.ownerMemberDisplayName}
                                </span>
                                {w.ownerDepartmentName ? (
                                  <span className="block truncate text-xs text-fg-muted">
                                    {w.ownerDepartmentName}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          ) : (
                            <EmptyCell />
                          )}
                        </td>
                      ) : null}
                      {showNextReview ? (
                        <td className="whitespace-nowrap px-4 py-4 text-sm tabular text-fg-secondary">
                          {w.nextReviewAt ? formatKoreanDate(w.nextReviewAt) : <EmptyCell />}
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-4 py-4 text-sm tabular text-fg-secondary">
                        {w.lastChangeAt ? formatKoreanDate(w.lastChangeAt) : <EmptyCell />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
