// Watch 조회. 모든 쿼리는 workspaceId scope 필수.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WATCH_SORT, type WatchSort, type WatchSortKey } from "./sort";

export {
  DEFAULT_WATCH_SORT,
  WATCH_SORT_KEYS,
  nextWatchSort,
  parseWatchSort,
} from "./sort";
export type { SortDir, WatchSort, WatchSortKey } from "./sort";

export interface WatchListParams {
  workspaceId: string;
  search?: string;                       // 법령명 부분일치 (ILIKE)
  applicability?: string;                // UNKNOWN | APPLICABLE | NOT_APPLICABLE | NEEDS_REVIEW
  importance?: string;                   // LOW | NORMAL | HIGH | URGENT
  includeArchived?: boolean;             // default false
  sort?: WatchSort;                      // default { key: "added", dir: "desc" }
  limit?: number;                        // default 50
  offset?: number;                       // default 0
}

export interface WatchListItem {
  id: string;
  documentId: string;
  documentTitle: string;
  documentType: string;
  ministry: string | null;
  applicabilityStatus: string;
  importance: string;
  status: string;
  ownerMemberDisplayName: string | null;
  ownerDepartmentName: string | null;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
  lastChangeAt: Date | null;
  createdAt: Date;
}

/**
 * "지금 관리 중인 관심 법령" 의 정의. 세는 곳과 보여주는 곳이 반드시 같아야
 * 한다 — 대시보드의 "관리 법령 N" 은 archivedAt 만 보고, 목록은 여기에
 * status 까지 봤다. 지금은 전부 ACTIVE 라 숫자가 맞지만, 상태가 ARCHIVED 인데
 * archivedAt 이 안 찍힌 행이 하나만 생겨도 두 숫자가 갈라진다.
 */
export const ACTIVE_WATCH_FILTER: Prisma.WatchWhereInput = {
  archivedAt: null,
  status: { in: ["ACTIVE", "PAUSED"] },
};

// ACTIVE Watch 목록 + 문서 메타 + 소유자/부서 이름 + 최근 변경일.
export async function listWatches(params: WatchListParams): Promise<{
  items: WatchListItem[];
  total: number;
}> {
  const limit = Math.min(params.limit ?? 50, 100);
  const offset = params.offset ?? 0;

  const where = {
    workspaceId: params.workspaceId,
    ...(params.includeArchived ? {} : ACTIVE_WATCH_FILTER),
    ...(params.applicability ? { applicabilityStatus: params.applicability } : {}),
    ...(params.importance ? { importance: params.importance } : {}),
    ...(params.search
      ? {
          document: {
            OR: [
              { currentTitle: { contains: params.search, mode: "insensitive" as const } },
              { currentAgencyName: { contains: params.search, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  // ── 정렬: DB 에서 순서를 정하고 id 만 받아온다 ────────────────────
  const sort = params.sort ?? DEFAULT_WATCH_SORT;
  const dir = sort.dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  // NULL 은 방향과 무관하게 항상 뒤로. "값이 없는 것" 이 목록 맨 앞을 차지하면
  // (최근 개정에서 겪은 그대로) 정렬이 고장난 것처럼 보인다.
  const key: Record<WatchSortKey, Prisma.Sql> = {
    title: Prisma.sql`d.current_title ${dir}`,
    ministry: Prisma.sql`d.current_agency_name IS NULL, d.current_agency_name ${dir}`,
    // 상태·중요도는 알파벳순이 아니라 뜻의 순서로 정렬해야 한다.
    applicability: Prisma.sql`array_position(ARRAY['APPLICABLE','NEEDS_REVIEW','UNKNOWN','NOT_APPLICABLE'], w.applicability_status) ${dir}`,
    importance: Prisma.sql`array_position(ARRAY['LOW','NORMAL','HIGH','URGENT'], w.importance) ${dir}`,
    review: Prisma.sql`w.next_review_at IS NULL, w.next_review_at ${dir}`,
    change: Prisma.sql`last_change IS NULL, last_change ${dir}`,
    added: Prisma.sql`w.created_at ${dir}`,
  };

  const conds: Prisma.Sql[] = [Prisma.sql`w.workspace_id = ${params.workspaceId}`];
  if (!params.includeArchived) {
    conds.push(Prisma.sql`w.archived_at IS NULL`);
    conds.push(Prisma.sql`w.status IN ('ACTIVE','PAUSED')`);
  }
  if (params.applicability)
    conds.push(Prisma.sql`w.applicability_status = ${params.applicability}`);
  if (params.importance) conds.push(Prisma.sql`w.importance = ${params.importance}`);
  if (params.search) {
    const like = `%${params.search}%`;
    conds.push(
      Prisma.sql`(d.current_title ILIKE ${like} OR d.current_agency_name ILIKE ${like})`,
    );
  }

  const ordered = await prisma.$queryRaw<{ id: string }[]>`
    SELECT w.id
    FROM watch w
    JOIN legal_document d ON d.id = w.document_id
    LEFT JOIN LATERAL (
      SELECT MAX(e.detected_at) AS last_change
      FROM legal_change_event e
      WHERE e.document_id = w.document_id
    ) lc ON TRUE
    WHERE ${Prisma.join(conds, " AND ")}
    ORDER BY ${key[sort.key]}, w.id ASC
    LIMIT ${limit} OFFSET ${offset}`;
  const orderedIds = ordered.map((r) => r.id);
  const rank = new Map(orderedIds.map((id, i) => [id, i]));

  const [rows, total] = await Promise.all([
    prisma.watch.findMany({
      // 순서는 위에서 정했다. 여기서는 본문만 채우고 rank 로 되돌린다.
      // workspaceId 는 raw 쿼리에도 걸려 있지만 여기서도 건다 — 모든 조회에
      // workspace scope 필수라는 규칙에 예외를 두지 않는다.
      where: { id: { in: orderedIds }, workspaceId: params.workspaceId },
      select: {
        id: true,
        documentId: true,
        applicabilityStatus: true,
        importance: true,
        status: true,
        nextReviewAt: true,
        lastReviewedAt: true,
        createdAt: true,
        document: {
          select: {
            currentTitle: true,
            documentType: true,
            currentAgencyName: true,
            // 최근 변경 1건만
            changeEvents: {
              orderBy: { detectedAt: "desc" },
              take: 1,
              select: { detectedAt: true },
            },
          },
        },
        ownerMember: { select: { user: { select: { displayName: true, email: true } } } },
        ownerDepartment: { select: { name: true } },
      },
    }),
    prisma.watch.count({ where }),
  ]);

  const items = rows
    .slice()
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    .map<WatchListItem>((r) => ({
      id: r.id,
      documentId: r.documentId,
      documentTitle: r.document.currentTitle,
      documentType: r.document.documentType,
      ministry: r.document.currentAgencyName,
      applicabilityStatus: r.applicabilityStatus,
      importance: r.importance,
      status: r.status,
      ownerMemberDisplayName:
        r.ownerMember?.user.displayName ?? r.ownerMember?.user.email ?? null,
      ownerDepartmentName: r.ownerDepartment?.name ?? null,
      nextReviewAt: r.nextReviewAt,
      lastReviewedAt: r.lastReviewedAt,
      lastChangeAt: r.document.changeEvents[0]?.detectedAt ?? null,
      createdAt: r.createdAt,
    }));

  return { items, total };
}

// 단일 Watch 상세 — 편집 폼용 전체 필드 + 문서 메타.
export async function getWatchDetail(workspaceId: string, watchId: string) {
  return prisma.watch.findFirst({
    where: { id: watchId, workspaceId },
    include: {
      document: {
        select: {
          id: true,
          currentTitle: true,
          documentType: true,
          currentAgencyName: true,
          externalDocumentId: true,
          legalSource: { select: { sourceType: true } },
          changeEvents: {
            orderBy: { detectedAt: "desc" },
            take: 5,
            select: { id: true, detectedAt: true, effectiveDate: true, eventType: true },
          },
        },
      },
      ownerMember: { select: { id: true, user: { select: { displayName: true, email: true } } } },
      ownerDepartment: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
    },
  });
}

// Workspace 내 사용자 선택 옵션 (담당자 select).
export async function listWorkspaceMemberOptions(workspaceId: string) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, status: "ACTIVE" },
    select: { id: true, user: { select: { displayName: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return members.map((m) => ({
    id: m.id,
    label: m.user.displayName ?? m.user.email ?? m.id.slice(0, 6),
  }));
}

// Workspace 내 부서 옵션.
export async function listDepartmentOptions(workspaceId: string) {
  const depts = await prisma.department.findMany({
    where: { workspaceId, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return depts.map((d) => ({ id: d.id, label: d.name }));
}

// Watch 존재 여부 (문서 상세 페이지 버튼 상태 판단용).
export async function getWatchByDocument(workspaceId: string, documentId: string) {
  return prisma.watch.findUnique({
    where: { workspaceId_documentId: { workspaceId, documentId } },
    select: { id: true, status: true, archivedAt: true },
  });
}
