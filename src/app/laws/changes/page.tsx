// 최근 개정 — "무엇이 바뀌었는가"를 날짜순으로 보는 공개 피드.
//
// /laws 는 "법령을 찾는" 화면이고, 여기는 "바뀐 것을 보는" 화면이다.
// 두 축이 한 목록에 섞여 있어서(정렬 드롭다운 안에 숨어서) 안 보이던 것을 분리했다.
// 로그인 없이 볼 수 있다 — 이 화면이 재방문 이유가 되고, 관심 등록으로 이어진다.

import Link from "next/link";
import { PublicPageShell } from "@/components/PublicPageShell";
import { listRecentChanges, parseRecentChangesSort } from "@/lib/queries/recentChanges";
import { listMinistries, listDocumentTypes } from "@/lib/queries/lawList";
import { formatKoreanDate } from "@/lib/format";
import { eventTypeLabel } from "@/lib/style";
import { Icon } from "@/components/Icon";
import { ComboSelect } from "@/components/ComboSelect";
import { changeSummaryLabel } from "@/lib/laws/changeSummary";
import { DDay } from "@/components/ui/dday";
import {
  Button,
  ButtonLink,
  EmptyState,
  FilterBar,
  PageHeader,
  Panel,
  Pagination,
  SegmentedLinks,
} from "@/components/ui";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: { ministry?: string; type?: string; sort?: string; page?: string };
}

export default async function RecentChangesPage({ searchParams }: Props) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const ministry = searchParams.ministry?.trim() || undefined;
  const type = searchParams.type?.trim() || undefined;
  const sort = parseRecentChangesSort(searchParams.sort);

  const [{ items, total, pageSize }, ministries, docTypes] = await Promise.all([
    listRecentChanges({ ministry, documentType: type, sort, page }),
    listMinistries(),
    listDocumentTypes(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(ministry || type);

  const buildHref = (p: number) => {
    const usp = new URLSearchParams();
    if (ministry) usp.set("ministry", ministry);
    if (type) usp.set("type", type);
    if (sort !== "changed") usp.set("sort", sort);
    if (p > 1) usp.set("page", String(p));
    const qs = usp.toString();
    return qs ? `/laws/changes?${qs}` : "/laws/changes";
  };

  // 날짜 머리글을 그릴지 판단하는 커서. 페이지 경계에서 첫 행은 항상 머리글을
  // 갖는다 — 그래야 어느 페이지로 바로 들어와도 날짜를 알 수 있다.
  // 정렬 축을 바꾸면 페이지는 1로 되돌린다.
  const sortHref = (next: string) => {
    const usp = new URLSearchParams();
    if (ministry) usp.set("ministry", ministry);
    if (type) usp.set("type", type);
    if (next !== "changed") usp.set("sort", next);
    const qs = usp.toString();
    return qs ? `/laws/changes?${qs}` : "/laws/changes";
  };

  // 날짜가 바뀔 때만 구분선을 그어 "언제 무엇이" 가 읽히게 한다.
  let lastDateLabel = "";

  return (
    <PublicPageShell>
      <PageHeader
        title="최근 개정"
        /* "날짜순" 이라고만 쓰면 어느 날짜인지가 안 적혀 있어서, 화면에 같이
           보이는 시행일이 정렬 키라고 읽힌다. 무슨 날짜 기준인지 명시한다. */
        description={
          sort === "effective"
            ? "시행일이 가까운 순서로 봅니다. 이미 시행된 건과 시행일 미정은 뒤에 옵니다."
            : "공포일이 최근인 순서로 봅니다. 공포일이 없는 고시 등은 감지일로 표시합니다."
        }
        meta={`${total.toLocaleString("ko-KR")}건`}
        actions={
          <ButtonLink href="/laws" variant="secondary">
            <Icon name="search" size={15} />
            법령 찾기
          </ButtonLink>
        }
      />

      <FilterBar action="/laws/changes">
        {/* 소관부처가 229개다. native select 로 두면 원하는 부처를 찾으려고
            수백 줄을 스크롤해야 한다 (사용성 테스트 지적). /laws 와 같은
            검색 가능한 콤보를 쓴다. */}
        <ComboSelect
          name="ministry"
          value={ministry ?? ""}
          placeholder="소관부처 전체"
          options={ministries}
        />
        <ComboSelect
          name="type"
          value={type ?? ""}
          placeholder="문서 종류 전체"
          options={docTypes}
        />
        <Button type="submit" variant="secondary">
          필터 적용
        </Button>
        {hasFilters ? (
          <ButtonLink href="/laws/changes" variant="ghost">
            초기화
          </ButtonLink>
        ) : null}
      </FilterBar>

      {/* 정렬 축을 화면에 드러낸다. 지금까지는 정렬 키가 하나뿐이면서 그게
          무엇인지 어디에도 안 적혀 있었다. */}
      <div className="mt-4">
        <SegmentedLinks
          items={[
            { href: sortHref("changed"), label: "공포일순", active: sort === "changed" },
            { href: sortHref("effective"), label: "시행일순", active: sort === "effective" },
          ]}
        />
      </div>

      <div className="mt-5">
        {items.length === 0 ? (
          <Panel>
            <EmptyState
              icon="bell"
              title="표시할 개정이 없습니다"
              description="조건을 바꾸거나 필터를 초기화해 보세요."
              action={
                hasFilters ? (
                  <ButtonLink href="/laws/changes" variant="secondary" size="sm">
                    필터 초기화
                  </ButtonLink>
                ) : null
              }
            />
          </Panel>
        ) : (
          <Panel className="overflow-hidden">
            {items.map((c) => {
              // 머리글은 항상 "지금 정렬 기준이 되는 날짜" 여야 한다. 공포일순인데
              // 시행일로 묶으면 다시 라벨과 실제가 어긋난다.
              const groupDate =
                sort === "effective" ? c.effectiveDate : c.changedAt;
              const label = groupDate ? formatKoreanDate(groupDate) : "시행일 미정";
              // 같은 날짜면 칸을 비워 묶음으로 읽히게 했었다. 그런데 공포일이
              // 없는 고시가 하루에 수천 건씩 몰려 있어서, 2쪽부터는 12행이
              // 전부 빈칸인 화면이 수백 페이지 이어졌다. 날짜순인지 확인할
              // 방법이 화면에 없으니 "정렬이 무작위" 로 보이는 게 당연했다.
              // 빈칸 대신 날짜 머리글을 한 줄 두어, 어느 화면을 봐도 지금
              // 보고 있는 날짜가 적혀 있게 한다.
              const newGroup = label !== lastDateLabel;
              lastDateLabel = label;
              return (
                <div key={c.eventId}>
                  {newGroup ? (
                    <div className="flex items-baseline gap-2 border-b border-line bg-subtle px-4 py-2 sm:px-5">
                      <span className="text-sm font-medium tabular text-fg">
                        {label}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {sort === "effective"
                          ? groupDate
                            ? "시행"
                            : ""
                          : c.isDetectedFallback
                            ? "감지 (공포일 정보 없음)"
                            : "공포"}
                      </span>
                    </div>
                  ) : null}
                  <Link
                    href={`/laws/${c.sourceId}?event=${c.eventId}`}
                    className="flex flex-col gap-2 border-b border-line px-4 py-4 transition-colors duration-swift hover:bg-hover sm:flex-row sm:items-center sm:gap-5 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-legal text-legal font-bold text-fg">
                        {c.documentTitle}
                      </div>
                      <div className="mt-0.5 text-sm text-fg-muted">
                        {eventTypeLabel(c.eventType)}
                        {` · ${changeSummaryLabel(c)}`}
                        {c.ministry ? ` · ${c.ministry}` : ""}
                      </div>
                    </div>

                    <div className="shrink-0 text-right sm:w-32">
                      <div className="flex flex-col items-end gap-0.5">
                        {c.effectiveDate ? (
                          <span className="text-sm tabular text-fg-secondary">
                            {formatKoreanDate(c.effectiveDate)} 시행
                          </span>
                        ) : null}
                        <DDay date={c.effectiveDate} />
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </Panel>
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        buildHref={buildHref}
      />
    </PublicPageShell>
  );
}
