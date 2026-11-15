import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LEGAL_SOURCE_ID } from "@/lib/law-api/sources";
import { searchTokens, titleMatchesSql } from "./lawSearch";

// 정렬 옵션.
// - recent (기본): 최근 개정일 내림차순. 목록에 보이는 "최근 개정" 컬럼과 같은 값.
// - title: 이름 가나다순
// - ministry: 소관부처 → 이름 순
//
// 정렬 버그(2026-08): recent 가 lastSeenAt(수집기가 마지막으로 확인한 시각) 이었다.
// 그건 화면 어디에도 안 나오는 값이라, 목록에 보이는 "최근 개정" 컬럼은
// 2024.11.12 → 2026.8.11 → 2026.7.21 처럼 뒤죽박죽으로 보였다. "최근 활동순"
// 이라는 이름이 그 불일치를 가려주고 있었다. 이제 실제로 최근 개정순이다.
//
// 개정일은 원래 legal_document_version 에만 있어서 조회할 때마다 LATERAL 로
// 물어봤다. 문서마다 한 번씩 도느라 문서 수에 선형으로 느려졌다 —
// 실측 15,850건 161ms → 24,527건 330ms. v14 에서 last_change_at 컬럼으로
// 내리고 인덱스를 걸었다. 이제 인덱스 스캔이다.
// 정렬 자체는 여전히 raw SQL 이다 — Prisma orderBy 로는 NULL 처리와
// 다단 tiebreak 을 이 형태로 못 쓴다.
export type LawListSort = "recent" | "title" | "ministry";
export const LAW_LIST_SORT_VALUES: LawListSort[] = ["recent", "title", "ministry"];
export const LAW_LIST_SORT_LABEL: Record<LawListSort, string> = {
  recent: "최근 개정순",
  title: "이름순",
  ministry: "소관부처순",
};

export interface LawListQuery {
  search?: string;
  documentType?: string;
  ministry?: string;
  sourceType?: "LAW" | "ADMIN_RULE";
  sort?: LawListSort;
  page?: number;
  pageSize?: number;
}

export interface LawListRow {
  id: string;
  sourceType: string; // 파생값 (LegalSource.sourceType)
  sourceId: string;   // externalDocumentId (URL 호환 유지)
  title: string;
  documentType: string;
  ministry: string | null;
  lastEffectiveDate: Date | null;
  lastPromulgationDate: Date | null;
  lastIssuanceDate: Date | null;
  latestRevisionType: string | null;
  latestPromulgationNumber: string | null;
  latestIssuanceNumber: string | null;
  latestChangeEventId: string | null;
  changedCount: number;
  /** 최신 이벤트의 유형·이전 판 유무. "변경" 이라 부를 수 있는지 판단에 쓴다. */
  latestEventType: string | null;
  latestHasPrevious: boolean;
  lastCheckedAt: Date;
}

export async function listLaws(query: LawListQuery): Promise<{
  rows: LawListRow[];
  total: number;
  page: number;
  pageSize: number;
  /**
   * 예전에는 검색이 문서 id 를 3,000건까지만 모아 그걸로 걸렀다.
   * 실측하니 "고시" · "규정" · "법" · "관리" · "운영" 같은 흔한 말이 전부
   * 상한에 걸렸고, 그 사실이 화면에 표시되지도 않아 총 건수까지 3,000 으로
   * 나왔다. 이제 제목 조건을 본 쿼리에 그대로 넣어 상한 자체가 없다.
   * 항상 false — 호출부 호환을 위해 필드는 남긴다.
   */
  searchTruncated: boolean;
}> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  const legalSourceIdFilter = query.sourceType
    ? LEGAL_SOURCE_ID[query.sourceType]
    : undefined;

  // 검색어는 제목 정규화 매칭이라 Prisma contains 로는 안 된다. 예전에는
  // 후보 id 를 3,000건까지 모아 id IN (...) 으로 걸렀는데, 흔한 말은 전부
  // 그 상한에 걸렸다(실측: 고시·규정·법·관리·운영). 조건을 본 쿼리에 그대로
  // 넣으면 상한도 필요 없고 총 건수도 맞는다.
  const tokens = query.search ? searchTokens(query.search) : [];

  // 필터는 raw 정렬 쿼리와 count 가 반드시 같아야 하므로 나란히 만든다.
  const conds: Prisma.Sql[] = [];
  if (tokens.length > 0) conds.push(titleMatchesSql(tokens));
  if (query.documentType) conds.push(Prisma.sql`d.document_type = ${query.documentType}`);
  if (query.ministry) conds.push(Prisma.sql`d.current_agency_name = ${query.ministry}`);
  if (legalSourceIdFilter)
    conds.push(Prisma.sql`d.legal_source_id = ${legalSourceIdFilter}`);
  const whereSql = conds.length ? Prisma.join(conds, " AND ") : Prisma.sql`TRUE`;

  // 개정일이 없는 문서는 방향과 무관하게 뒤로 보낸다. "값이 없는 것" 이 맨 앞을
  // 차지하면 정렬이 고장난 것처럼 보인다 — 최근 개정 목록에서 겪은 그대로다.
  const orderSql =
    query.sort === "title"
      ? Prisma.sql`d.current_title ASC`
      : query.sort === "ministry"
        ? Prisma.sql`d.current_agency_name IS NULL, d.current_agency_name ASC, d.current_title ASC`
        : Prisma.sql`d.last_change_at IS NULL, d.last_change_at DESC`;

  const ordered = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d.id
    FROM legal_document d
    WHERE ${whereSql}
    ORDER BY ${orderSql}, d.id DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const orderedIds = ordered.map((r) => r.id);
  const rank = new Map(orderedIds.map((id, i) => [id, i]));

  const [rows, total] = await Promise.all([
    prisma.legalDocument.findMany({
      // 순서는 위에서 정했다. 여기서는 본문만 채우고 rank 로 되돌린다.
      where: { id: { in: orderedIds } },
      include: {
        legalSource: { select: { sourceType: true } },
        versions: {
          // desc 는 Postgres 에서 NULLS FIRST 다. 공포일이 없는 버전(행정규칙)이
          // 섞인 문서에서 그 버전이 "최신" 으로 뽑혀 목록에 엉뚱한 날짜가 나온다.
          orderBy: [
            { promulgationDate: { sort: "desc", nulls: "last" } },
            { issuanceDate: { sort: "desc", nulls: "last" } },
          ],
          take: 1,
          select: {
            promulgationDate: true,
            issuanceDate: true,
            effectiveDate: true,
            revisionType: true,
            promulgationNumber: true,
            issuanceNumber: true,
          },
        },
        changeEvents: {
          // 같은 이유. 이 값이 "변경 보기" 링크가 가리키는 이벤트를 정한다.
          orderBy: [
            { promulgationDate: { sort: "desc", nulls: "last" } },
            { issuanceDate: { sort: "desc", nulls: "last" } },
          ],
          take: 1,
          select: {
            id: true,
            totalDiffCount: true,
            eventType: true,
            previousVersionId: true,
          },
        },
      },
    }),
    // 총 건수도 같은 조건으로 센다. 목록과 숫자가 갈라지면 안 된다.
    prisma
      .$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM legal_document d WHERE ${whereSql}`
      .then((r) => Number(r[0]?.c ?? 0)),
  ]);

  return {
    rows: rows
      .slice()
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
      .map((r) => ({
      id: r.id,
      sourceType: r.legalSource.sourceType,
      sourceId: r.externalDocumentId,
      title: r.currentTitle,
      documentType: r.documentType,
      ministry: r.currentAgencyName,
      lastEffectiveDate: r.versions[0]?.effectiveDate ?? null,
      lastPromulgationDate: r.versions[0]?.promulgationDate ?? null,
      lastIssuanceDate: r.versions[0]?.issuanceDate ?? null,
      latestRevisionType: r.versions[0]?.revisionType ?? null,
      latestPromulgationNumber: r.versions[0]?.promulgationNumber ?? null,
      latestIssuanceNumber: r.versions[0]?.issuanceNumber ?? null,
      latestChangeEventId: r.changeEvents[0]?.id ?? null,
      changedCount: r.changeEvents[0]?.totalDiffCount ?? 0,
      latestEventType: r.changeEvents[0]?.eventType ?? null,
      latestHasPrevious: r.changeEvents[0]?.previousVersionId != null,
      lastCheckedAt: r.lastCheckedAt,
    })),
    total,
    page,
    pageSize,
    /** 검색 결과가 상한에 걸려 잘렸는지. 화면에서 "검색어를 좁히세요" 안내에 쓴다. */
    searchTruncated: false,
  };
}

export async function listDocumentTypes(): Promise<string[]> {
  const rows = await prisma.legalDocument.findMany({
    distinct: ["documentType"],
    select: { documentType: true },
    orderBy: { documentType: "asc" },
  });
  return rows.map((r) => r.documentType);
}

export async function listMinistries(): Promise<string[]> {
  const rows = await prisma.legalDocument.findMany({
    where: { currentAgencyName: { not: null } },
    distinct: ["currentAgencyName"],
    select: { currentAgencyName: true },
    orderBy: { currentAgencyName: "asc" },
  });
  return rows.map((r) => r.currentAgencyName).filter((m): m is string => m !== null);
}
