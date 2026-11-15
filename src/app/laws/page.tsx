// 법령 탐색 — "검색 경험"이 이 화면의 본체다.
//
// 제2판은 5열 고정 그리드였다. 법령명·소관부처·공포일·시행일·변경건수가 같은
// 무게로 나열돼서 스캔이 안 됐고, 시행 임박 행은 배경 전체를 붉게 칠해 목록의
// 리듬을 깨뜨렸다.
// 제3판:
//   · 검색창을 화면의 주요 요소로 (h-11, 넓게)
//   · 결과는 3분할 행 — 좌: 법령명+메타 / 중: 최근 개정 / 우: 시행일+D-day
//   · 임박은 행 전체를 칠하지 않고 D-day 텍스트 색으로만 표시
//
// 쿼리 파라미터(q / type / ministry / sort / page)와 정렬 의미는 그대로다.

import Link from "next/link";
import { PublicPageShell } from "@/components/PublicPageShell";
import { Icon } from "@/components/Icon";
import { LastSyncedAt } from "@/components/LastSyncedAt";
import { formatDocumentNumber } from "@/lib/laws/documentNumber";
import { SearchAutocomplete } from "@/components/SearchAutocomplete";
import { ComboSelect } from "@/components/ComboSelect";
import {
  listLaws,
  listDocumentTypes,
  listMinistries,
  LAW_LIST_SORT_VALUES,
  LAW_LIST_SORT_LABEL,
  type LawListSort,
} from "@/lib/queries/lawList";
import { formatKoreanDate, computeDDay } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { listTopMinistries } from "@/lib/queries/recentChanges";
import { changeSummaryLabel } from "@/lib/laws/changeSummary";
import { DDay } from "@/components/ui/dday";
import {
  Button,
  ButtonLink,
  EmptyCell,
  EmptyState,
  FilterSelect,
  PageHeader,
  Panel,
  Pagination,
} from "@/components/ui";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: {
    q?: string;
    type?: string;
    ministry?: string;
    sort?: string;
    page?: string;
  };
}

function normalizeSort(raw: string | undefined): LawListSort {
  return (LAW_LIST_SORT_VALUES as string[]).includes(raw ?? "")
    ? (raw as LawListSort)
    : "recent";
}

/** 목록 행에 붙일 법령번호. 종류는 이미 앞에 나오므로 번호만 남긴다. */
function docNumber(r: {
  sourceType: string;
  documentType: string;
  latestPromulgationNumber: string | null;
  latestIssuanceNumber: string | null;
}): string {
  const full = formatDocumentNumber(
    r.sourceType,
    r.documentType,
    r.latestPromulgationNumber,
    r.latestIssuanceNumber,
  );
  return full === "-" ? "" : full.replace(`${r.documentType} `, "");
}

export default async function LawsListPage({ searchParams }: Props) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const sort = normalizeSort(searchParams.sort);
  const [{ rows, total, pageSize }, docTypes, ministries, topMinistries, lastRun] = await Promise.all([
    listLaws({
      search: searchParams.q?.trim() || undefined,
      documentType: searchParams.type || undefined,
      ministry: searchParams.ministry || undefined,
      sort,
      page,
      pageSize: 30,
    }),
    listDocumentTypes(),
    listMinistries(),
    // 소관부처가 229개라 콤보박스에만 두면 "부처로 찾는다"는 축이 안 보인다.
    // 문서 수 상위만 칩으로 꺼내 두고 나머지는 콤보박스로 빠진다.
    listTopMinistries(10),
    // 카탈로그 동기화 시각을 실제 CollectorRun 에서 가져와 표시.
    prisma.collectorRun.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true, jobType: true, newCount: true, changedCount: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(
    searchParams.q || searchParams.type || searchParams.ministry,
  );

  const buildHref = (p: number) => {
    const usp = new URLSearchParams();
    if (searchParams.q) usp.set("q", searchParams.q);
    if (searchParams.type) usp.set("type", searchParams.type);
    if (searchParams.ministry) usp.set("ministry", searchParams.ministry);
    if (searchParams.sort) usp.set("sort", searchParams.sort);
    if (p > 1) usp.set("page", String(p));
    const qs = usp.toString();
    return qs ? `/laws?${qs}` : "/laws";
  };

  return (
    <PublicPageShell>
      <PageHeader
        title="법령 탐색"
        description="현재 시행 중인 법령과 최근 변경 사항을 검색합니다."
        meta={`${total.toLocaleString("ko-KR")}건`}
        actions={
          <>
            {/* 동기화 시각을 모를 때 렌더 시각("이 화면 기준")을 대신 보여주던
                자리. 그건 "지금"이라는 뜻일 뿐 데이터가 언제 것인지는 말해주지
                않아서, 알 때만 보여준다. */}
            {lastRun?.finishedAt ? (
              <LastSyncedAt at={lastRun.finishedAt} kind="synced" className="hidden sm:inline-flex" />
            ) : null}
            {/* "최근 개정"·"산업별" 은 사이드바에 이미 있다. 같은 이름의 버튼을
                여기 또 두면 "사이드바 것과 다른 건가" 하고 한 번 더 생각하게
                된다(사용성 평가). 중복 제거하고 이 화면 고유의 것만 남긴다. */}
          </>
        }
      />

      {/* 검색은 이 화면의 주요 element. 필터는 그 아래 한 줄 compact. */}
      <form action="/laws" method="get" className="space-y-2.5">
        <div className="relative">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-fg-muted"
          />
          <SearchAutocomplete
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="법령명, 조문, 키워드 검색"
            className="h-11 w-full rounded-md border border-line-strong bg-surface pl-11 pr-3 text-base text-fg placeholder:text-fg-muted focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ComboSelect
            name="type"
            value={searchParams.type ?? ""}
            placeholder="문서 종류 전체"
            options={docTypes}
          />
          {/* 100+ 부처는 native select 로 감당이 안 돼 검색 가능한 콤보를 쓴다. */}
          <ComboSelect
            name="ministry"
            value={searchParams.ministry ?? ""}
            placeholder="소관부처 전체"
            options={ministries}
          />
          <FilterSelect name="sort" defaultValue={sort} aria-label="정렬">
            {LAW_LIST_SORT_VALUES.map((v) => (
              <option key={v} value={v}>
                {LAW_LIST_SORT_LABEL[v]}
              </option>
            ))}
          </FilterSelect>
          <Button type="submit" variant="primary">
            검색
          </Button>
          {hasFilters ? (
            <ButtonLink href="/laws" variant="ghost">
              초기화
            </ButtonLink>
          ) : null}
        </div>
      </form>

      {/* 부처별 진입 — 필터가 걸려 있지 않을 때만 노출한다.
          이미 좁혀서 보고 있는 사용자에게 다시 넓히는 링크를 보여줄 이유가 없다. */}
      {!hasFilters && topMinistries.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-sm text-fg-secondary">소관부처로 찾기</p>
          <div className="flex flex-wrap gap-1.5">
            {topMinistries.map((m) => (
              <Link
                key={m.name}
                href={`/laws?ministry=${encodeURIComponent(m.name)}`}
                // 390px 실측에서 높이 30px 였다. 본문 속 인라인 링크와 달리
                // 이건 손가락으로 고르는 칩이라 영역을 키운다.
                className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-line bg-surface px-3 py-1.5 text-sm text-fg-secondary transition-colors duration-swift hover:border-line-strong hover:text-fg"
              >
                {m.name}
                <span className="tabular text-xs text-fg-muted">
                  {m.count.toLocaleString("ko-KR")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        {rows.length === 0 ? (
          <Panel>
            <EmptyState
              icon="search"
              title="조회된 법령이 없습니다"
              description="다른 키워드로 검색하거나 필터를 초기화해 보세요."
              action={
                hasFilters ? (
                  <ButtonLink href="/laws" variant="secondary" size="sm">
                    필터 초기화
                  </ButtonLink>
                ) : null
              }
            />
          </Panel>
        ) : (
          <Panel className="divide-y divide-line overflow-hidden">
            {rows.map((r) => {
              const dDay = r.lastEffectiveDate ? computeDDay(r.lastEffectiveDate) : null;
              return (
                <Link
                  key={r.id}
                  href={`/laws/${r.sourceId}`}
                  className="flex flex-col gap-3 px-4 py-4 transition-colors duration-swift hover:bg-hover sm:flex-row sm:items-center sm:gap-6 sm:px-5"
                >
                  {/* 좌: 법령명이 시각적 최우선 */}
                  <div className="min-w-0 flex-1">
                    {/* 법령명은 법령의 목소리(명조). 메타·D-day 는 도구(고딕). */}
                    <div className="font-legal text-legal font-bold text-fg sm:text-base">
                      {r.title}
                    </div>
                    {/* 제목·종류·소관부처가 전부 같고 발령번호만 다른 문서가
                        실제로 있다 (행정안전부 "안전기준 등록" 8건). 번호가
                        없으면 목록에 똑같은 줄이 여러 개 보인다. */}
                    <div className="mt-0.5 text-sm text-fg-muted">
                      {r.documentType}
                      {r.ministry ? ` · ${r.ministry}` : ""}
                      {docNumber(r) ? ` · ${docNumber(r)}` : ""}
                    </div>
                  </div>

                  {/* 중: 최근 개정 */}
                  <div className="shrink-0 text-sm sm:w-40">
                    <div className="tabular text-fg-secondary">
                      {/* 행정규칙에는 공포일이 없고 발령일이 그 자리다. 공포일만
                          보다 보니 고시·훈령 행은 전부 "—" 로 비어 있었고,
                          정렬은 발령일을 쓰는데 화면은 비어 있어 "날짜 없는
                          것들이 중간에 끼어든다" 로 보였다. */}
                      {r.lastPromulgationDate ?? r.lastIssuanceDate ? (
                        <>
                          최근 개정{" "}
                          {formatKoreanDate(
                            r.lastPromulgationDate ?? r.lastIssuanceDate,
                          )}
                        </>
                      ) : (
                        <EmptyCell />
                      )}
                    </div>
                    <div className="mt-0.5">
                      {/* 최초 수집은 비교 대상이 없어 변경 카드가 없다.
                          "N개 조항 변경" 이라고 하면 눌렀을 때 빈 화면을 만난다. */}
                      <span className={r.changedCount > 0 ? "text-fg-muted" : "text-fg-disabled"}>
                        {changeSummaryLabel({
                          eventType: r.latestEventType ?? "REVISION",
                          totalDiffCount: r.changedCount,
                          hasPrevious: r.latestHasPrevious,
                        })}
                      </span>
                    </div>
                  </div>

                  {/* 우: 시행일 + D-day. 행 전체를 칠하지 않는다. */}
                  <div className="flex shrink-0 items-center gap-3 sm:w-36 sm:justify-end">
                    <div className="text-right">
                      <div className="text-sm tabular text-fg-secondary">
                        {r.lastEffectiveDate ? (
                          <>{formatKoreanDate(r.lastEffectiveDate)} 시행</>
                        ) : (
                          <EmptyCell />
                        )}
                      </div>
                      {/* 탐색 화면은 목록이 길어 모든 행에 D-day 를 붙이면
                          시끄럽다. 앞뒤로 가까운 것만 보여준다. */}
                      {dDay !== null && dDay >= -30 && dDay <= 90 ? (
                        <div className="mt-0.5">
                          <DDay date={r.lastEffectiveDate} />
                        </div>
                      ) : null}
                    </div>
                    <Icon
                      name="chevron-right"
                      size={16}
                      className="hidden shrink-0 text-fg-disabled sm:block"
                    />
                  </div>
                </Link>
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

      {/* 이 목록이 어디까지 담고 있는지 알 방법이 없었다. 담당자가 "안 나오면
          없는 것" 인지 "아직 안 들어온 것" 인지 구분해야 한다. */}
      <p className="mt-8 text-center text-sm text-fg-muted">
        법제처 국가법령정보 공개 API 기준 · 매일 아침 갱신 ·{" "}
        <Link href="/about" className="underline underline-offset-2 hover:text-fg-secondary">
          담고 있는 범위와 한계
        </Link>
      </p>
    </PublicPageShell>
  );
}
