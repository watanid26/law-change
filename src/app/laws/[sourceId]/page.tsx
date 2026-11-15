import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleFullView } from "@/components/ArticleFullView";
import { DiffCard, articleAnchor } from "@/components/DiffCard";
import { DiffCardStack } from "@/components/DiffCardStack";
import { DiffTreeNav } from "@/components/DiffTreeNav";
import { DownloadDocxButton } from "@/components/DownloadDocxButton";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { FilterBar } from "@/components/FilterBar";
import { LawDetailTabs } from "@/components/LawDetailTabs";
import { LawHeader } from "@/components/LawHeader";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { PublicPageShell } from "@/components/PublicPageShell";
import { Icon } from "@/components/Icon";
import { ButtonLink } from "@/components/ui";
import { RightPanel } from "@/components/RightPanel";
import { WatchToggle } from "@/components/WatchToggle";
import { getLawDetailForDashboard, getLawFullText } from "@/lib/queries/lawDetail";
import { getInterpretationsForLaw } from "@/lib/queries/interpretations";
import { getDecisionsForLaw } from "@/lib/queries/decisions";
import { tryGetUserContext } from "@/lib/auth/session";
import { getWatchByDocument } from "@/lib/watches/queries";
import { EventNavLink } from "./EventNavLink";
import { RiskSummary } from "@/components/RiskBadge";
import { assessEventRisk } from "@/lib/risk/query";

export const dynamic = "force-dynamic";

interface Props {
  params: { sourceId: string };
  searchParams: { type?: string; onlyChanged?: string; event?: string; tab?: string };
}

// 검색 유입용 페이지 메타데이터.
// 법무 담당자는 "OO법 개정", "OO법 시행일" 로 검색한다. 제목과 설명에 법령명 ·
// 소관부처 · 시행일이 들어가야 검색 결과에서 클릭된다.
export async function generateMetadata({
  params,
}: {
  params: { sourceId: string };
}): Promise<Metadata> {
  const law = await getLawDetailForDashboard(params.sourceId);
  if (!law) return { title: "법령을 찾을 수 없습니다" };

  const parts = [law.type, law.ministry].filter(Boolean).join(" · ");
  const description =
    `${law.name} — ${parts ? `${parts}. ` : ""}` +
    `${law.promulgationDate} 공포, ${law.effectiveDate} 시행. ` +
    `개정으로 어떤 조문이 바뀌었는지 이전 내용과 비교해 확인하세요.`;

  // 사이트맵에서 뺀 얇은 페이지는 여기서도 색인을 막아야 말이 맞는다.
  // 조문도 없고 변경 이력도 없으면 화면에 제목 말고 보여줄 게 없다
  // (실측 628건 · 행정규칙이 늘면서 더 는다). 이런 페이지를 수천 개
  // 색인시키면 사이트 전체 색인 품질이 깎인다.
  const fullText = await getLawFullText(params.sourceId);
  const thin = law.changes.length === 0 && (fullText?.articles.length ?? 0) === 0;

  return {
    title: law.name,
    description,
    ...(thin ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical: `/laws/${params.sourceId}` },
    openGraph: {
      type: "article",
      title: `${law.name} · LawChange`,
      description,
      url: `/laws/${params.sourceId}`,
    },
  };
}

export default async function LawDetailPage({ params, searchParams }: Props) {
  const law = await getLawDetailForDashboard(params.sourceId, {
    eventId: searchParams.event,
  });
  if (!law) notFound();

  const userCtx = await tryGetUserContext();
  const currentWatch = userCtx
    ? await getWatchByDocument(userCtx.workspaceId, law.id)
    : null;

  const filterType = normalizeFilterType(searchParams.type);
  const onlyChanged = searchParams.onlyChanged !== "false";

  const filteredChanges = law.changes.filter((c) => {
    if (filterType && c.changeType !== filterType) return false;
    return true;
  });

  // 라운드 17 T2: 이전에는 law.counts(서버 집계)와 law.changes(실제 diff 배열)가
  // 별도 소스라 배지 "신설 10" + 본문 "변경 없음" 모순이 발생했음. 카운트를
  // changes 배열에서 직접 파생시켜 단일 소스 원칙을 강제. 백엔드 law.counts
  // 필드는 사용 중단(정리 티켓 별도).
  const derivedCounts = {
    total: law.changes.length,
    added: law.changes.filter((c) => c.changeType === "added").length,
    modified: law.changes.filter((c) => c.changeType === "modified").length,
    deleted: law.changes.filter((c) => c.changeType === "deleted").length,
    moved: law.changes.filter((c) => c.changeType === "moved").length,
  };

  const showBanner = !law.latestEvent.isViewingLatest;
  const bannerVariant: "auto-fallback" | "user-selected" = searchParams.event ? "user-selected" : "auto-fallback";

  // 조문 전문 fetch — 탭 라벨 카운트 + full 탭 렌더링에 공용 사용.
  // 이 시점 fetch 는 SSR 1회 이므로 별도 lazy 로딩 없이 간단하게 처리.
  const fullText = await getLawFullText(params.sourceId);
  const [interpretations, decisions] = await Promise.all([
    getInterpretationsForLaw(law.id),
    getDecisionsForLaw(law.id),
  ]);
  const articleCount = fullText
    ? fullText.articles.filter((a) => a.unitType !== "CHAPTER" && a.unitType !== "SECTION").length
    : 0;

  // 지금 보고 있는 개정의 신호. 조문을 20개만 로드하는 화면과 달리
  // 전체 diff 를 보고 판정한다.
  const risk = await assessEventRisk(law.changeEventId);

  const activeTab: "diff" | "full" = resolveActiveTab({
    requested: searchParams.tab,
    hasEventParam: Boolean(searchParams.event),
    diffTotal: derivedCounts.total,
    articleCount,
  });

  return (
    <PublicPageShell>
      {/* 제3판: 헤더에 primary action 을 붙이고, 본문/우측 레일은 그 아래 한 행.
          제2판처럼 헤더 배경과 레일 배경과 캔버스가 한 세로선에서 부딪히지 않는다. */}
      <LawHeader
        law={law}
        actions={
          userCtx ? (
            <WatchToggle
              documentId={law.id}
              initialWatch={
                currentWatch && currentWatch.status !== "ARCHIVED"
                  ? { id: currentWatch.id, status: currentWatch.status }
                  : null
              }
            />
          ) : (
            <ButtonLink href="/login" variant="primary">
              로그인하고 관심 등록
            </ButtonLink>
          )
        }
      />
      <div className="flex min-w-0 gap-8">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-w-0 flex-1 space-y-6">
            {userCtx && currentWatch?.status === "ACTIVE" ? (
              <p className="flex items-center gap-2 text-sm text-fg-secondary">
                <Icon name="bookmark" size={15} className="text-primary-text" />
                이 법령은 관심 법령으로 등록되어 있습니다.
              </p>
            ) : null}

            {activeTab === "diff" && showBanner && (
              <EventBanner
                variant={bannerVariant}
                sourceId={params.sourceId}
                latestEffectiveDate={law.latestEvent.effectiveDate}
                latestPromulgationDate={law.latestEvent.promulgationDate}
                latestRevisionType={law.latestEvent.revisionType}
                latestEventId={law.latestEvent.changeEventId}
                currentPromulgationDate={law.promulgationDate}
                currentEffectiveDate={law.effectiveDate}
              />
            )}

            <LawDetailTabs
              sourceId={params.sourceId}
              activeTab={activeTab}
              diffCount={derivedCounts.total}
              articleCount={articleCount}
            />

            {activeTab === "diff" ? (
              <>
                {/* 조문 대조로 바로 들어가기 전에 "이게 급한 일인가" 를 먼저
                    말한다. 원문 개정 비교까지 왔는데 사실 나열만 있으면
                    그 판단을 사람이 처음부터 다시 해야 한다. */}
                <RiskSummary verdict={risk} />

                {/* 라운드 21 P1+P2 · 라운드 25 refactor: 감사팀 제출용 리포트 내보내기.
                    DOCX 앵커 → JS fetch 다운로드로 변경 (Vercel navigation 503 우회 + UX 피드백). */}
                {derivedCounts.total > 0 && (
                  <div className="flex flex-wrap items-center gap-2 print-hide">
                    <ExportPdfButton />
                    <DownloadDocxButton
                      href={`/api/export/laws/${params.sourceId}/diff${searchParams.event ? `?event=${searchParams.event}` : ""}`}
                      filename={`${law.name}-diff-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}.docx`}
                    />
                  </div>
                )}
                {/* 변경이 0건이면 "전체 0 · 신설 0 · 수정 0 …" 칩만 남는다.
                    거를 게 없는 자리에 필터를 두지 않는다. */}
                {derivedCounts.total > 0 ? (
                  <FilterBar
                    counts={derivedCounts}
                    sourceId={params.sourceId}
                    selectedType={filterType ?? "all"}
                    onlyChanged={onlyChanged}
                  />
                ) : null}
                {/* 라운드 20: 좌측 변경 조문 트리 + 중앙 카드 스택. 카드 3건 이상일 때만 트리 노출.
                    라운드 23 B1: 함수 prop 전달을 제거하고 anchorId 를 서버에서 미리 계산해 문자열로 전달.
                    함수 prop 은 client component 로 serialize 불가 → 3건+ 개정 법령 전부 SSR 크래시. */}
                <div className="lg:flex lg:gap-8">
                  {filteredChanges.length >= 3 && (
                    <DiffTreeNav
                      items={filteredChanges.map((c) => ({
                        articleKey: c.articleKey,
                        anchorId: articleAnchor(c.articleKey),
                        articleNumber: c.articleNumber,
                        articleTitle: c.articleTitle,
                        changeType: c.changeType,
                      }))}
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-5 pb-10">
                    {filteredChanges.length === 0 ? (
                      <EmptyState
                        hasAnyChanges={law.changes.length > 0}
                        isFirstIssue={law.isFirstIssue}
                        hasArticles={articleCount > 0}
                      />
                    ) : (
                      <DiffCardStack>
                        {filteredChanges.map((change) => (
                          <DiffCard key={change.articleKey} change={change} />
                        ))}
                      </DiffCardStack>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="pb-10">
                {fullText ? (
                  <ArticleFullView
                    articles={fullText.articles}
                    latestVersionLabel={fullText.latestVersionLabel}
                    repeal={fullText.repeal}
                    attachments={fullText.attachments}
                  />
                ) : (
                  <div className="rounded-md border border-line bg-surface p-10 text-center">
                    {/* 수집 실패처럼 읽히던 문구를 사실에 맞게 고쳤다.
                        (같은 이유는 ArticleFullView 주석 참고) */}
                    <p className="text-base text-fg">
                      조문으로 나뉘어 있지 않은 문서입니다
                    </p>
                    <p className="mt-2 text-sm text-fg-secondary">
                      고시·공고처럼 조·항 구조 없이 쓰인 문서는 조문 단위로 나눌 수
                      없습니다. 전문은 법제처 원문에서 확인하실 수 있습니다.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <RightPanel law={law} sourceId={params.sourceId} interpretations={interpretations} decisions={decisions} />
      </div>
      {/* 라운드 20: 텍스트 선택 시 조문 복사·인용 툴바. article-* 섹션 안 선택에만 반응. */}
      <SelectionToolbar />
    </PublicPageShell>
  );
}

function normalizeFilterType(
  raw: string | undefined,
): "added" | "modified" | "deleted" | "moved" | null {
  if (raw === "added" || raw === "modified" || raw === "deleted" || raw === "moved") {
    return raw;
  }
  return null;
}

// 탭 기본값 결정:
// 1. URL 에 tab=full|diff 명시 → 존중
// 2. ?event= 딥링크 (알림·인박스에서 유입) → 보여줄 변경이 있을 때만 diff
// 3. 개정 이력 0건이고 조문 전문이 있으면 → full (empty 화면 대신 유용한 컨텐츠)
// 4. 그 외 → diff (제품 포지션이 "법령 추적")
//
// 2번에 "무조건" 이 붙어 있던 게 문제였다. 최초 수집(FIRST_ISSUE, 이전 판
// 없음) 이벤트는 비교 대상이 없어 변경 카드가 0개인데, 목록이 ?event= 로
// 링크하니 빈 diff 화면에 착지했다. 실측 15,402건(전체의 13.7% · 행정규칙은
// 94%)이 이 상태였다. 보여줄 게 없으면 전문으로 보낸다.
function resolveActiveTab(input: {
  requested: string | undefined;
  hasEventParam: boolean;
  diffTotal: number;
  articleCount: number;
}): "diff" | "full" {
  if (input.requested === "full") return "full";
  if (input.requested === "diff") return "diff";
  if (input.diffTotal === 0 && input.articleCount > 0) return "full";
  if (input.hasEventParam) return "diff";
  return "diff";
}

function EmptyState({
  hasAnyChanges,
  isFirstIssue,
  hasArticles,
}: {
  hasAnyChanges: boolean;
  /** 최초 수집이라 비교 대상 자체가 없는 경우. */
  isFirstIssue?: boolean;
  /** 조문 전문이 있는지. 없으면 "전문을 보세요" 가 막다른 길이 된다. */
  hasArticles?: boolean;
}) {
  if (hasAnyChanges) {
    return (
      <div className="rounded-md border border-line bg-surface p-10 text-center">
        <p className="text-sm text-fg-secondary">
          선택한 필터에 해당하는 조문이 없습니다. 필터를 조정해 보세요.
        </p>
      </div>
    );
  }
  if (isFirstIssue) {
    // "본문 변경이 없습니다" 는 틀린 말이다. 비교할 이전 판이 없어서
    // 변경을 만들 수 없는 것이고, 다음 개정부터는 여기에 나온다.
    return (
      <div className="rounded-md border border-line bg-surface p-10 text-center">
        <p className="text-base text-fg">아직 비교할 이전 판이 없습니다</p>
        <p className="mt-2 text-sm text-fg-secondary">
          이 문서를 처음 수집한 시점입니다. 다음 개정부터 무엇이 바뀌었는지
          조문 단위로 보여드립니다.
          {hasArticles
            ? " 지금은 조문 전문을 확인하세요."
            : " 이 문서는 조·항 구조가 없어 전문도 나뉘어 있지 않습니다. 법제처 원문에서 확인하세요."}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-line bg-surface p-10 text-center">
      <p className="text-base text-fg">이 개정에는 조문 본문 변경이 없습니다</p>
      <p className="mt-2 text-sm text-fg-secondary">
        부칙만 개정되었거나 타법 개정에 따른 형식적 반영일 가능성이 큽니다.
      </p>
    </div>
  );
}

interface BannerProps {
  variant: "auto-fallback" | "user-selected";
  sourceId: string;
  latestEffectiveDate: string;
  latestPromulgationDate: string;
  latestRevisionType: string;
  latestEventId: string;
  currentPromulgationDate: string;
  currentEffectiveDate: string;
}

function EventBanner({
  variant,
  sourceId,
  latestEffectiveDate,
  latestPromulgationDate,
  latestRevisionType,
  latestEventId,
  currentPromulgationDate,
  currentEffectiveDate,
}: BannerProps) {
  if (variant === "auto-fallback") {
    return (
      <div className="flex items-start justify-between gap-4 border-l-[3px] border-change-modifiedMark bg-change-modifiedPanel px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-warning">
            최신 개정 ({latestPromulgationDate} {latestRevisionType})은 조문 본문 변경이 없습니다
          </p>
          <p className="mt-1.5 text-sm text-fg-secondary">
            직전 조문 개정 ({currentPromulgationDate})을 표시하고 있습니다. 부칙만 개정되었거나 타법 개정으로 판단됩니다.
          </p>
        </div>
        <EventNavLink
          href={`/laws/${sourceId}?event=${latestEventId}`}
          className="whitespace-nowrap text-xs font-semibold text-warning hover:underline"
        >
          최신 개정 그대로 보기 →
        </EventNavLink>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-4 border-l-[3px] border-primary bg-selected border-r border-t border-b border-line px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary-text">
          과거 개정 조회 중: {currentPromulgationDate} 공포 / {currentEffectiveDate} 시행
        </p>
        <p className="mt-1.5 text-sm text-fg-secondary">
          최신 개정은 {latestEffectiveDate} 시행 ({latestRevisionType})입니다.
        </p>
      </div>
      <EventNavLink
        href={`/laws/${sourceId}`}
        className="whitespace-nowrap text-xs font-semibold text-primary-text hover:underline"
      >
        최신으로 이동 →
      </EventNavLink>
    </div>
  );
}
