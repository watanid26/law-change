import type { ArticleFullText, ArticleUnitType } from "@/lib/queries/lawDetail";
import { FullArticleSidebar, type FullArticleSection } from "./FullArticleSidebar";
import { CHANGE_EDGE, ChangeBadge } from "./ui/change";
import type { ChangeType } from "@/lib/types";

interface Props {
  articles: ArticleFullText[];
  latestVersionLabel: string;
  repeal?: { revisionType: string; effectiveDate: string | null } | null;
  attachments?: { fileName: string; sourceUrl: string }[];
}

// 부칙/별표는 본칙과 분리해 별도 섹션으로 묶음.
// CHAPTER/SECTION 는 앵커 라벨로만 소비하고 본문 카드는 렌더링하지 않음.
export function ArticleFullView({
  articles,
  latestVersionLabel,
  repeal,
  attachments = [],
}: Props) {
  const sections = splitSections(articles);

  // 폐지되는 법령은 본문이 "이 법은 폐지한다" 한 줄만 남는다. 그것만 보여주면
  // 왜 한 줄뿐인지 알 수 없고, 폐지 사실 자체가 사용자에게 가장 중요한 정보다.
  const repealNotice = repeal ? (
    <div className="mb-4 rounded-md border border-danger bg-danger-subtle p-4">
      <p className="text-base font-semibold text-danger">
        {repeal.effectiveDate
          ? `이 법령은 ${repeal.effectiveDate}자로 폐지됩니다`
          : "이 법령은 폐지됩니다"}
      </p>
      <p className="mt-1.5 text-sm text-fg-secondary">
        개정 형태 {repeal.revisionType}. 아래 본문은 폐지를 정한 조문이며, 폐지 전
        조문은 개정 이력에서 확인하실 수 있습니다.
      </p>
    </div>
  ) : null;

  // 조문이 없는 문서 중 상당수(697건)는 본문이 첨부 파일로만 제공된다.
  // "조문으로 나뉘어 있지 않다" 로만 끝내면 본문을 어디서 봐야 하는지 알 수 없다.
  const attachmentList =
    attachments.length > 0 ? (
      <div className="mt-6 text-left">
        <p className="text-sm font-semibold text-fg">첨부 파일</p>
        <ul className="mt-2 space-y-1.5">
          {attachments.map((f) => (
            <li key={f.sourceUrl}>
              <a
                href={f.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-text underline underline-offset-2 hover:no-underline"
              >
                {f.fileName}
              </a>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  if (articles.length === 0) {
    return (
      <>
        {repealNotice}
        <div className="rounded-md border border-line bg-surface p-10 text-center">
        {/* "아직 수집되지 않았습니다 · 잠시 뒤 다시 방문해 주세요" 라고 적혀
            있었다. 수집 실패처럼 읽히는데 사실이 아니다 — 전수점검에서 조문이
            없는 문서 628건(행정규칙 6.0% · 법령 0.3%)을 확인해 보니 대부분
            "2023년 국립박물관 평가인증 대상기관 고시" 처럼 애초에 조문 구조가
            없는 문서였다. 기다려도 생기지 않는다. 있는 그대로 말하고 원문으로
            보낸다. */}
        <p className="text-base text-fg">
            {attachments.length > 0
              ? "본문이 첨부 파일로 제공되는 문서입니다"
              : "조문으로 나뉘어 있지 않은 문서입니다"}
          </p>
          <p className="mt-2 text-sm text-fg-secondary">
            {attachments.length > 0
              ? "법제처가 이 문서의 본문을 조문 형태로 제공하지 않습니다. 아래 파일에서 전문을 확인하실 수 있습니다."
              : "고시·공고처럼 조·항 구조 없이 쓰인 문서는 조문 단위로 나눌 수 없습니다. 전문은 법제처 원문에서 확인하실 수 있습니다."}
          </p>
          {attachmentList}
        </div>
      </>
    );
  }

  // 라운드 27: 사이드바를 client 컴포넌트로 분리 → useScrollSpy 훅으로 스크롤 하이라이트 반응.
  // (심사 재검증: 이전엔 이 사이드바가 순수 <a href="#..."> 라 스크롤 무반응)
  const sidebarSections: FullArticleSection[] = sections.map((s) => ({
    key: s.key,
    title: s.title,
    items: s.items.map((a) => ({
      id: a.id,
      unitNumber: a.unitNumber,
      unitTitle: a.unitTitle,
    })),
  }));

  return (
    <div>
      {repealNotice}
      <div className="lg:flex lg:gap-8">
      <FullArticleSidebar sections={sidebarSections} latestVersionLabel={latestVersionLabel} />

      <div className="min-w-0 max-w-reading flex-1 space-y-2">
        {sections.map((section) => (
          <div key={section.key} className="space-y-3">
            {section.title && (
              <h2 className="pt-2 font-legal text-lg font-bold text-fg">
                {section.title}
              </h2>
            )}
            {section.items.map((a) => (
              <article
                key={a.id}
                id={`article-${a.id}`}
                className={cardClass(a.recentChangeType)}
              >
                <header className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-legal text-lg font-bold text-fg">
                      <span className="legal-token">{a.unitNumber}</span>
                      {a.unitTitle && (
                        <span className="ml-1.5 font-normal text-fg-secondary">
                          ({a.unitTitle})
                        </span>
                      )}
                    </div>
                  </div>
                  {a.recentChangeType && <RecentChangeBadge type={a.recentChangeType} />}
                </header>
                <div className="whitespace-pre-line font-legal text-legal text-fg">
                  {stripLeadingLabel(a.contentText, a.unitNumber, a.unitTitle)}
                </div>
              </article>
            ))}
          </div>
        ))}
          {attachmentList}
        </div>
      </div>
    </div>
  );
}

interface Section {
  key: string;
  title: string | null;
  items: ArticleFullText[];
}

function splitSections(articles: ArticleFullText[]): Section[] {
  const main: ArticleFullText[] = [];
  const addendum: ArticleFullText[] = [];
  const annex: ArticleFullText[] = [];
  for (const a of articles) {
    if (a.unitType === "CHAPTER" || a.unitType === "SECTION") continue;
    if (a.unitType === "ADDENDUM") addendum.push(a);
    else if (a.unitType === "ANNEX" || a.unitType === "FORM" || a.unitType === "TABLE") annex.push(a);
    else main.push(a);
  }
  const sections: Section[] = [];
  if (main.length > 0) sections.push({ key: "main", title: null, items: main });
  if (addendum.length > 0) sections.push({ key: "addendum", title: "부칙", items: addendum });
  if (annex.length > 0) sections.push({ key: "annex", title: "별표·서식", items: annex });
  return sections;
}

function cardClass(changeType?: "added" | "modified" | "deleted" | "moved") {
  // 조각 시스템: 모든 조문을 카드로 감싸지 않는다. 기본은 면 + 얇은 구분선이고,
  // hover 했을 때만 조각 경계가 아주 약하게 드러난다(.fragment-hover).
  // 최근 변경이 있는 조문에만 좌측 마커를 준다 — 무엇이 바뀌었는지가 신호다.
  const base =
    "fragment-hover rounded-sm border-b border-line bg-surface px-4 py-4 scroll-mt-24 sm:px-5";
  if (changeType === "added") return `${base} ${CHANGE_EDGE.added}`;
  if (changeType === "modified") return `${base} ${CHANGE_EDGE.modified}`;
  if (changeType === "deleted") return `${base} ${CHANGE_EDGE.deleted}`;
  if (changeType === "moved") return `${base} ${CHANGE_EDGE.moved}`;
  return base;
}

function RecentChangeBadge({ type }: { type: ChangeType }) {
  // 색만으로 구분하지 않는다 — ChangeBadge 가 글리프+낱말을 함께 낸다.
  const labelMap = {
    added: "최근 신설",
    modified: "최근 개정",
    deleted: "최근 삭제",
    moved: "최근 이동",
  } as const;
  return <ChangeBadge type={type} label={labelMap[type]} />;
}

// 법제처 contentText 는 대개 "제N조(제목) 본문..." 형태.
// 카드 header 에 이미 번호·제목이 표시되므로 중복 접두어를 제거해 읽기 편하게 함.
function stripLeadingLabel(text: string, unitNumber: string | null, unitTitle: string | null): string {
  if (!text) return "";
  const trimmed = text.replace(/^\s+/, "");
  if (unitNumber) {
    const escaped = escapeRegExp(unitNumber);
    const patterns = [
      new RegExp(`^${escaped}\\s*\\([^)]*\\)\\s*`),
      new RegExp(`^${escaped}\\s+`),
    ];
    for (const p of patterns) {
      const m = trimmed.match(p);
      if (m) return trimmed.slice(m[0].length).trimStart();
    }
  }
  if (unitTitle) {
    const t = trimmed.replace(/^\([^)]+\)\s*/, "");
    if (t !== trimmed) return t;
  }
  return trimmed;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Ensure the type import isn't tree-shaken to an unused-var lint fail.
export type { ArticleUnitType };
