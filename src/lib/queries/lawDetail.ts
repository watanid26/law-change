import { prisma } from "@/lib/prisma";
import type { LawDetail as UILawDetail, ArticleChange, LawHistoryItem } from "@/lib/types";
import { formatKoreanDate, computeDDay } from "@/lib/format";
import { LEGAL_SOURCE_ID } from "@/lib/law-api/sources";
import { isDeletionMarker } from "@/lib/collector/diff";
import { formatDocumentNumber } from "@/lib/laws/documentNumber";

export interface LatestEventInfo {
  changeEventId: string;
  effectiveDate: string;
  promulgationDate: string;
  revisionType: string;
  isViewingLatest: boolean;
}

export interface LawDetailExtras {
  changeEventId: string;
  latestEvent: LatestEventInfo;
  historyEventIds: Array<{ versionId: string; changeEventId: string | null }>;
}

export type LawDetailForDashboard = UILawDetail & LawDetailExtras;

export interface GetLawDetailOptions {
  sourceType?: "LAW" | "ADMIN_RULE";
  eventId?: string;
}

export async function getLawDetailForDashboard(
  externalDocumentId: string,
  options: GetLawDetailOptions = {},
): Promise<LawDetailForDashboard | null> {
  const legalSourceIds = options.sourceType
    ? [LEGAL_SOURCE_ID[options.sourceType]]
    : [LEGAL_SOURCE_ID.LAW, LEGAL_SOURCE_ID.ADMIN_RULE];

  const doc = await prisma.legalDocument.findFirst({
    where: {
      externalDocumentId,
      legalSourceId: { in: legalSourceIds },
    },
    include: {
      legalSource: { select: { sourceType: true } },
      changeEvents: {
        // desc 는 Postgres 에서 NULLS FIRST 다. 공포일/발령일은 nullable 이라
        // 한 문서 안에 값이 있는 것과 없는 것이 섞이면 없는 쪽이 "최신" 으로
        // 뽑힌다. 지금은 섞인 문서가 0건이지만(실측) 수집 소스가 늘면 언제든
        // 생긴다 — 이번 라운드에 같은 함정으로 두 번 데었다.
        // 이 정렬이 상세 화면의 기본 표시 이벤트(absoluteLatest)를 정한다.
        orderBy: [
          { promulgationDate: { sort: "desc", nulls: "last" } },
          { issuanceDate: { sort: "desc", nulls: "last" } },
          { detectedAt: "desc" },
        ],
        take: 50,
        include: {
          diffs: { orderBy: { oldLabel: "asc" } },
          previousVersion: true,
          newVersion: true,
        },
      },
      versions: {
        // desc 는 Postgres 에서 NULLS FIRST 다. 공포일/발령일은 nullable 이라
        // 한 문서 안에 값이 있는 것과 없는 것이 섞이면 없는 쪽이 "최신" 으로
        // 뽑힌다. 지금은 섞인 문서가 0건이지만(실측) 수집 소스가 늘면 언제든
        // 생긴다 — 이번 라운드에 같은 함정으로 두 번 데었다.
        orderBy: [
          { promulgationDate: { sort: "desc", nulls: "last" } },
          { issuanceDate: { sort: "desc", nulls: "last" } },
        ],
        take: 30,
        select: {
          id: true,
          promulgationDate: true,
          issuanceDate: true,
          effectiveDate: true,
          promulgationNumber: true,
          issuanceNumber: true,
          revisionType: true,
        },
      },
    },
  });

  if (!doc) return null;

  const events = doc.changeEvents;
  const absoluteLatest = events[0];

  let selectedEvent = absoluteLatest;
  if (options.eventId) {
    const found = events.find((e) => e.id === options.eventId);
    if (found) selectedEvent = found;
  } else if (absoluteLatest && absoluteLatest.diffs.length === 0) {
    const withDiffs = events.find((e) => e.diffs.length > 0);
    if (withDiffs) selectedEvent = withDiffs;
  }

  const sourceType = doc.legalSource.sourceType;

  if (!selectedEvent) {
    const latestVersion = doc.versions[0];
    if (!latestVersion) return null;
    return baseFromVersionOnly(
      { id: doc.id, title: doc.currentTitle, documentType: doc.documentType, ministry: doc.currentAgencyName, sourceType },
      latestVersion,
      // 개정 이벤트가 아직 없어도 시행 예정 판은 있을 수 있다.
      doc.versions,
    );
  }

  const beforePrev = selectedEvent.previousVersion;
  const beforeDateLabel = beforePrev
    ? `${formatKoreanDate(
        beforePrev.effectiveDate ?? beforePrev.promulgationDate ?? beforePrev.issuanceDate,
      )} 이전`
    : undefined;
  const afterDateLabel = formatKoreanDate(
    selectedEvent.effectiveDate ?? selectedEvent.promulgationDate ?? selectedEvent.issuanceDate,
  );

  const changes: ArticleChange[] = selectedEvent.diffs.map((d) => {
    // Schema v7: changeType 값이 ADDED/DELETED/MODIFIED/MOVED로 정규화됨.
    // 소급 방어: DB 에 이미 MOVED 로 저장된 조문 중 실제 본문이 "제N조 삭제 <...>" 뿐이면
    // UI 에선 DELETED 로 재분류. 라운드 6 QA (010146 제43조) 케이스가 대표.
    // 근본은 collector 재실행으로 재분류해야 하지만, 시연·재검증 신뢰 회복이 우선.
    let uiChangeType: "added" | "deleted" | "modified" | "moved" =
      d.changeType === "ADDED"
        ? "added"
        : d.changeType === "DELETED"
          ? "deleted"
          : d.changeType === "MOVED"
            ? "moved"
            : "modified";
    if (uiChangeType === "moved" && d.newText && isDeletionMarker(d.newText)) {
      uiChangeType = "deleted";
    }
    return {
      articleKey: d.contentUnitId ?? d.id,
      articleNumber: d.newLabel ?? d.oldLabel ?? "",
      // 조번호가 실제로 바뀐 경우에만. 같으면 "제6조 → 제6조" 같은 무의미한
      // 표시가 된다.
      previousNumber:
        d.oldLabel && d.newLabel && d.oldLabel !== d.newLabel
          ? d.oldLabel
          : undefined,
      articleTitle: "",
      changeType: uiChangeType,
      beforeDate: beforeDateLabel,
      afterDate: `${afterDateLabel} ${d.changeType === "ADDED" ? "신설" : "개정"}`,
      beforeText: d.oldText ? splitToLines(d.oldText) : undefined,
      afterText: d.newText ? splitToLines(d.newText) : undefined,
      addedLines: extractAddedLineIndices(d.diffOperations as unknown),
    };
  });

  const versionToEvent = new Map(events.map((e) => [e.newVersionId, e.id]));
  const history: LawHistoryItem[] = doc.versions.map((v) => ({
    id: v.id,
    date: formatKoreanDate(v.promulgationDate ?? v.issuanceDate),
    revisionType: v.revisionType,
    lawNumber: formatDocumentNumber(sourceType, doc.documentType, v.promulgationNumber, v.issuanceNumber),
    isCurrent: v.id === selectedEvent.newVersionId,
    changeEventId: versionToEvent.get(v.id) ?? null,
  }));

  const dDay = computeDDay(selectedEvent.effectiveDate);
  const isViewingLatest = selectedEvent.id === absoluteLatest.id;

  return {
    id: doc.id,
    name: doc.currentTitle,
    type: doc.documentType,
    ministry: doc.currentAgencyName ?? "",
    lawNumber: formatDocumentNumber(
      sourceType,
      doc.documentType,
      selectedEvent.newVersion.promulgationNumber,
      selectedEvent.newVersion.issuanceNumber,
    ),
    revisionType: selectedEvent.newVersion.revisionType,
    promulgationDate: formatKoreanDate(
      selectedEvent.promulgationDate ?? selectedEvent.issuanceDate,
    ),
    effectiveDate: formatKoreanDate(selectedEvent.effectiveDate),
    effectiveDateNote:
      selectedEvent.effectiveDateText
        ?? selectedEvent.newVersion.effectiveDateText
        ?? undefined,
    dDay,
    effectiveDateFull: selectedEvent.effectiveDate
      ? `${formatKoreanDate(selectedEvent.effectiveDate)} 시행`
      : "시행일 정보 없음",
    changes,
    counts: {
      total: selectedEvent.totalDiffCount,
      added: selectedEvent.addedCount,
      modified: selectedEvent.modifiedCount,
      deleted: selectedEvent.deletedCount,
      moved: selectedEvent.movedCount ?? 0,
    },
    history,
    isFirstIssue:
      selectedEvent.eventType === "FIRST_ISSUE" && selectedEvent.previousVersionId === null,
    enforcement: buildEnforcement(sourceType, doc.documentType, doc.versions),
    memo: emptyMemo(),
    checklist: [],
    status: "review_needed",
    reminder: {
      id: "r1",
      date: formatKoreanDate(selectedEvent.effectiveDate),
      dDay: dDay === null ? "시행일 미정" : `D${dDay >= 0 ? "-" : "+"}${Math.abs(dDay)}`,
      label: "알림 받기",
    },
    __hint: sourceType === "ADMIN_RULE" ? "고시" : undefined,
    changeEventId: selectedEvent.id,
    latestEvent: {
      changeEventId: absoluteLatest.id,
      effectiveDate: formatKoreanDate(
        absoluteLatest.effectiveDate ?? absoluteLatest.promulgationDate ?? absoluteLatest.issuanceDate,
      ),
      promulgationDate: formatKoreanDate(
        absoluteLatest.promulgationDate ?? absoluteLatest.issuanceDate,
      ),
      revisionType: absoluteLatest.newVersion.revisionType,
      isViewingLatest,
    },
    historyEventIds: doc.versions.map((v) => ({
      versionId: v.id,
      changeEventId: versionToEvent.get(v.id) ?? null,
    })),
  };
}

/**
 * 지금 지켜야 하는 판과 앞으로 닥칠 판을 갈라낸다.
 *
 * 헤더가 "가장 최근에 공포된 개정" 하나만 보여주다 보니, 시행이 한참 뒤인
 * 개정이 공포되면 그게 법령의 얼굴이 됐다. 식품위생법은 2026.6.9 공포·
 * 2029.1.1 시행 건 때문에 "시행까지 D-857" 이 떴는데, 현행은 제21065호이고
 * 다음에 닥치는 건 2026.10.8 이다. 컴플라이언스 화면에서 3년 뒤 날짜를
 * 보여주고 가까운 시행일을 감추는 건 안심시키는 방향으로 틀리는 것이다.
 */
function buildEnforcement(
  sourceType: string,
  documentType: string,
  versions: {
    effectiveDate: Date | null;
    promulgationNumber: string | null;
    issuanceNumber: string | null;
  }[],
): UILawDetail["enforcement"] {
  const dated = versions.filter(
    (v): v is typeof v & { effectiveDate: Date } => v.effectiveDate !== null,
  );
  const num = (v: (typeof dated)[number]) =>
    formatDocumentNumber(sourceType, documentType, v.promulgationNumber, v.issuanceNumber);

  const inForce = dated
    .filter((v) => (computeDDay(v.effectiveDate) ?? 1) <= 0)
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());
  const pending = dated
    .filter((v) => (computeDDay(v.effectiveDate) ?? -1) > 0)
    .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());

  const cur = inForce[0];
  const nxt = pending[0];
  return {
    current: cur
      ? { lawNumber: num(cur), effectiveDate: formatKoreanDate(cur.effectiveDate) }
      : null,
    pendingCount: pending.length,
    next: nxt
      ? {
          lawNumber: num(nxt),
          effectiveDate: formatKoreanDate(nxt.effectiveDate),
          dDay: computeDDay(nxt.effectiveDate),
        }
      : null,
  };
}

function baseFromVersionOnly(
  doc: {
    id: string;
    title: string;
    documentType: string;
    ministry: string | null;
    sourceType: string;
  },
  latestVersion: {
    id: string;
    promulgationDate: Date | null;
    issuanceDate: Date | null;
    promulgationNumber: string | null;
    issuanceNumber: string | null;
    revisionType: string;
  },
  allVersions: {
    effectiveDate: Date | null;
    promulgationNumber: string | null;
    issuanceNumber: string | null;
  }[] = [],
): LawDetailForDashboard {
  return {
    id: doc.id,
    name: doc.title,
    type: doc.documentType,
    ministry: doc.ministry ?? "",
    lawNumber: formatDocumentNumber(
      doc.sourceType,
      doc.documentType,
      latestVersion.promulgationNumber,
      latestVersion.issuanceNumber,
    ),
    revisionType: latestVersion.revisionType,
    promulgationDate: formatKoreanDate(latestVersion.promulgationDate ?? latestVersion.issuanceDate),
    effectiveDate: "-",
    effectiveDateNote: undefined,
    dDay: null,
    effectiveDateFull: "시행일 정보 없음",
    isFirstIssue: true, // 이벤트가 없으니 비교 대상도 없다
    enforcement: buildEnforcement(doc.sourceType, doc.documentType, allVersions),
    changes: [],
    counts: { total: 0, added: 0, modified: 0, deleted: 0, moved: 0 },
    history: [],
    memo: emptyMemo(),
    checklist: [],
    status: "review_needed",
    reminder: emptyReminder(),
    changeEventId: "",
    latestEvent: {
      changeEventId: "",
      effectiveDate: "-",
      promulgationDate: "-",
      revisionType: latestVersion.revisionType,
      isViewingLatest: true,
    },
    historyEventIds: [],
  };
}

function emptyMemo() {
  return {
    id: "memo-placeholder",
    content: ["로그인 후 활성화됩니다."],
    updatedAt: "-",
    author: "-",
  };
}

function emptyReminder() {
  return {
    id: "r1",
    date: "-",
    dDay: "-",
    label: "알림 받기",
  };
}

function splitToLines(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
}

// ────────────────────────────────────────────────────────────────
// 조문 전문(현행 시점) 조회 — 탭에서 사용
// ────────────────────────────────────────────────────────────────
export type ArticleUnitType =
  | "ARTICLE"
  | "ADDENDUM"
  | "ANNEX"
  | "FORM"
  | "TABLE"
  | "CHAPTER"
  | "SECTION"
  | "OTHER";

export interface ArticleFullText {
  id: string;
  contentUnitId: string;
  unitType: ArticleUnitType;
  unitNumber: string | null;
  unitTitle: string | null;
  contentText: string;
  unitOrder: number;
  recentChangeType?: "added" | "modified" | "deleted" | "moved";
}

export interface LawFullText {
  latestVersionLabel: string;
  latestPromulgationDate: string;
  articles: ArticleFullText[];
  /** 이 법령 자체가 폐지되는 경우. 본문이 "이 법은 폐지한다" 한 줄뿐이라 조문
   *  전문만 보면 왜 비었는지 알 수 없다. 폐지 사실과 날짜를 따로 알린다. */
  repeal: { revisionType: string; effectiveDate: string | null } | null;
  /** 본문이 조문이 아니라 첨부 파일로만 제공되는 문서(고시 등)의 파일 목록. */
  attachments: { fileName: string; sourceUrl: string }[];
}

export async function getLawFullText(
  externalDocumentId: string,
  options: GetLawDetailOptions = {},
): Promise<LawFullText | null> {
  const legalSourceIds = options.sourceType
    ? [LEGAL_SOURCE_ID[options.sourceType]]
    : [LEGAL_SOURCE_ID.LAW, LEGAL_SOURCE_ID.ADMIN_RULE];

  const doc = await prisma.legalDocument.findFirst({
    where: {
      externalDocumentId,
      legalSourceId: { in: legalSourceIds },
    },
    select: {
      id: true,
      versions: {
        // desc 는 Postgres 에서 NULLS FIRST 다. 공포일/발령일은 nullable 이라
        // 한 문서 안에 값이 있는 것과 없는 것이 섞이면 없는 쪽이 "최신" 으로
        // 뽑힌다. 지금은 섞인 문서가 0건이지만(실측) 수집 소스가 늘면 언제든
        // 생긴다 — 이번 라운드에 같은 함정으로 두 번 데었다.
        //
        // 분할시행 법령은 같은 날 공포된 줄이 여럿이다. 공포일까지만 보고
        // 정렬하면 그중 어느 것이 뽑힐지 정해지지 않는다. 실제로 자유무역협정
        // 시행규칙에서 조문이 0개인 줄이 뽑혀 "조문 전문 0" 이 나왔다.
        // 시행일과 id 까지 넣어 순서를 확정하고, 아래에서 본문이 있는 판을
        // 고른다.
        orderBy: [
          { promulgationDate: { sort: "desc", nulls: "last" } },
          { issuanceDate: { sort: "desc", nulls: "last" } },
          { effectiveDate: { sort: "desc", nulls: "last" } },
          { id: "desc" },
        ],
        take: 5,
        select: {
          id: true,
          promulgationDate: true,
          issuanceDate: true,
          effectiveDate: true,
          revisionType: true,
        },
      },
      changeEvents: {
        // desc 는 Postgres 에서 NULLS FIRST 다. 공포일/발령일은 nullable 이라
        // 한 문서 안에 값이 있는 것과 없는 것이 섞이면 없는 쪽이 "최신" 으로
        // 뽑힌다. 지금은 섞인 문서가 0건이지만(실측) 수집 소스가 늘면 언제든
        // 생긴다 — 이번 라운드에 같은 함정으로 두 번 데었다.
        // 이 정렬이 상세 화면의 기본 표시 이벤트(absoluteLatest)를 정한다.
        orderBy: [
          { promulgationDate: { sort: "desc", nulls: "last" } },
          { issuanceDate: { sort: "desc", nulls: "last" } },
          { detectedAt: "desc" },
        ],
        take: 1,
        select: {
          diffs: { select: { contentUnitId: true, changeType: true } },
        },
      },
    },
  });
  if (!doc || doc.versions.length === 0) return null;

  // 같은 공포건이 여러 줄인 문서에서 하필 본문이 없는 줄이 뽑히면 화면이
  // 통째로 빈다. 최신순 후보 중 본문이 있는 첫 판을 쓴다. 전부 없으면
  // (첨부 파일로만 제공되는 고시 등) 원래대로 맨 앞을 쓴다.
  const withContent = await prisma.legalContentUnitVersion.groupBy({
    by: ["documentVersionId"],
    where: { documentVersionId: { in: doc.versions.map((v) => v.id) } },
    _count: { _all: true },
  });
  const hasContent = new Set(withContent.map((r) => r.documentVersionId));
  const latestVersion = doc.versions.find((v) => hasContent.has(v.id)) ?? doc.versions[0];

  const unitVersions = await prisma.legalContentUnitVersion.findMany({
    where: { documentVersionId: latestVersion.id },
    orderBy: { unitOrder: "asc" },
    select: {
      id: true,
      contentUnitId: true,
      unitNumber: true,
      unitTitle: true,
      unitOrder: true,
      contentText: true,
      contentUnit: {
        select: {
          unitType: true,
          currentLabel: true,
        },
      },
    },
  });

  // 최신 개정 이벤트에 포함된 조문 → 뱃지용 매핑
  const changeMap = new Map<string, "added" | "modified" | "deleted" | "moved">();
  const latestEvent = doc.changeEvents[0];
  if (latestEvent) {
    for (const d of latestEvent.diffs) {
      if (!d.contentUnitId) continue;
      const t: "added" | "modified" | "deleted" | "moved" =
        d.changeType === "ADDED"
          ? "added"
          : d.changeType === "DELETED"
            ? "deleted"
            : d.changeType === "MOVED"
              ? "moved"
              : "modified";
      changeMap.set(d.contentUnitId, t);
    }
  }

  const articles: ArticleFullText[] = unitVersions.map((uv) => ({
    id: uv.id,
    contentUnitId: uv.contentUnitId,
    unitType: (uv.contentUnit.unitType as ArticleUnitType) ?? "OTHER",
    unitNumber: uv.unitNumber ?? uv.contentUnit.currentLabel ?? null,
    unitTitle: uv.unitTitle,
    contentText: uv.contentText,
    unitOrder: uv.unitOrder,
    recentChangeType: changeMap.get(uv.contentUnitId),
  }));

  const attachmentRows = await prisma.legalAttachment.findMany({
    where: { documentVersionId: latestVersion.id },
    orderBy: { id: "asc" },
    select: { fileName: true, sourceUrl: true },
  });

  return {
    latestVersionLabel: `${formatKoreanDate(latestVersion.promulgationDate ?? latestVersion.issuanceDate)} ${latestVersion.revisionType}`,
    latestPromulgationDate: formatKoreanDate(latestVersion.promulgationDate ?? latestVersion.issuanceDate),
    articles,
    attachments: attachmentRows
      .filter((a): a is { fileName: string | null; sourceUrl: string } => Boolean(a.sourceUrl))
      .map((a) => ({ fileName: a.fileName ?? "첨부 파일", sourceUrl: a.sourceUrl })),
    repeal: isRepeal(latestVersion.revisionType)
      ? {
          revisionType: latestVersion.revisionType,
          effectiveDate: latestVersion.effectiveDate
            ? formatKoreanDate(latestVersion.effectiveDate)
            : null,
        }
      : null,
  };
}

// "폐지제정" 은 이 법이 없어지는 게 아니라 옛 법을 폐지하고 새로 제정한다는
// 뜻이라 폐지가 아니다(428건). 실제 폐지는 "타법폐지"(6건) 와 "폐지"(3건).
const REPEAL_TYPES = new Set(["타법폐지", "폐지"]);
function isRepeal(revisionType: string | null | undefined): boolean {
  return REPEAL_TYPES.has((revisionType ?? "").trim());
}

function extractAddedLineIndices(ops: unknown): number[] {
  if (!Array.isArray(ops)) return [];
  const indices: number[] = [];
  let lineIdx = 0;
  for (const op of ops) {
    if (!op || typeof op !== "object") continue;
    const type = (op as { type?: string }).type;
    const text = (op as { text?: string }).text ?? "";
    const lines = text.split("\n").filter((l) => l.length > 0);
    if (type === "added") {
      for (let i = 0; i < lines.length; i++) indices.push(lineIdx + i);
      lineIdx += lines.length;
    } else if (type === "context") {
      lineIdx += lines.length;
    }
  }
  return indices;
}
