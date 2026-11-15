// Inbox 조회. workspaceId 스코프 필수.

import { prisma } from "@/lib/prisma";
import { INBOX_OPEN_STATUSES } from "./labels";

export interface InboxListParams {
  workspaceId: string;
  status?: string;                       // undefined = 열려있는 상태 (INBOX_OPEN_STATUSES)
  applicability?: string;
  search?: string;                       // 법령명
  /** 소관부처. 데이터는 원래 있었는데 이 화면에만 필터가 없었다. */
  ministry?: string;
  /** urgency = 시행일 임박순 (기본) · recent = 도착 최신순 */
  order?: "urgency" | "recent";
  limit?: number;
  offset?: number;
}

export interface InboxListItem {
  id: string;
  changeEventId: string;
  status: string;
  applicability: string;
  impactLevel: string | null;
  priority: string;
  documentId: string;
  documentTitle: string;
  documentType: string;
  ministry: string | null;
  eventType: string;
  effectiveDate: Date | null;
  detectedAt: Date;
  totalDiffCount: number;
  /** 비교할 이전 판이 있는지. 없으면 최초 수집이라 변경 카드가 없다. */
  hasPrevious: boolean;
  assignedMemberName: string | null;
  /** 목록에서 바로 배정을 바꾸려면 이름만으로는 안 되고 id 가 필요하다. */
  assignedMemberId: string | null;
  departmentName: string | null;
  createdAt: Date;
}

export async function listInboxItems(params: InboxListParams): Promise<{ items: InboxListItem[]; total: number }> {
  const limit = Math.min(params.limit ?? 50, 100);
  const offset = params.offset ?? 0;
  // 기본은 급한 순 — 이 목록이 답하는 질문이 "무엇부터 손대야 하나" 이기
  // 때문이다. createdAt 순이던 때는 대시보드에 D-56 → D-126 → D-35 → D-15
  // 처럼 나와서 무슨 기준인지 알 수 없었다.
  // 시행일 ASC 는 Postgres 기본이 NULLS LAST 라 시행일 미정이 뒤로 간다.
  const order = params.order ?? "urgency";

  const where = {
    workspaceId: params.workspaceId,
    archivedAt: null,
    status: params.status ? params.status : { in: INBOX_OPEN_STATUSES },
    ...(params.applicability ? { applicability: params.applicability } : {}),
    // 법령명 검색과 부처 필터가 같은 관계(changeEvent.document)를 파고들므로
    // 하나의 document 조건으로 합친다. 따로 쓰면 뒤엣것이 앞엣것을 덮는다.
    ...(params.search || params.ministry
      ? {
          changeEvent: {
            document: {
              ...(params.search
                ? { currentTitle: { contains: params.search, mode: "insensitive" as const } }
                : {}),
              ...(params.ministry ? { currentAgencyName: params.ministry } : {}),
            },
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.changeInboxItem.findMany({
      where,
      orderBy:
        order === "urgency"
          ? [{ changeEvent: { effectiveDate: "asc" } }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        changeEventId: true,
        status: true,
        applicability: true,
        impactLevel: true,
        priority: true,
        createdAt: true,
        assignedToMember: { select: { id: true, user: { select: { displayName: true, email: true } } } },
        ownerDepartment: { select: { name: true } },
        changeEvent: {
          select: {
            eventType: true,
            effectiveDate: true,
            detectedAt: true,
            totalDiffCount: true,
            previousVersionId: true,
            documentId: true,
            document: {
              select: {
                currentTitle: true,
                documentType: true,
                currentAgencyName: true,
              },
            },
          },
        },
      },
    }),
    prisma.changeInboxItem.count({ where }),
  ]);

  const items = rows.map<InboxListItem>((r) => ({
    id: r.id,
    changeEventId: r.changeEventId,
    status: r.status,
    applicability: r.applicability,
    impactLevel: r.impactLevel,
    priority: r.priority,
    documentId: r.changeEvent.documentId,
    documentTitle: r.changeEvent.document.currentTitle,
    documentType: r.changeEvent.document.documentType,
    ministry: r.changeEvent.document.currentAgencyName,
    eventType: r.changeEvent.eventType,
    effectiveDate: r.changeEvent.effectiveDate,
    detectedAt: r.changeEvent.detectedAt,
    totalDiffCount: r.changeEvent.totalDiffCount,
    hasPrevious: r.changeEvent.previousVersionId !== null,
    assignedMemberId: r.assignedToMember?.id ?? null,
    assignedMemberName:
      r.assignedToMember?.user.displayName ?? r.assignedToMember?.user.email ?? null,
    departmentName: r.ownerDepartment?.name ?? null,
    createdAt: r.createdAt,
  }));

  return { items, total };
}

// 상세 페이지용 — 이벤트 + 문서 + 최근 diff 요약 + Watch 링크.
export async function getInboxDetail(workspaceId: string, inboxId: string) {
  return prisma.changeInboxItem.findFirst({
    where: { id: inboxId, workspaceId },
    include: {
      changeEvent: {
        include: {
          document: {
            select: {
              id: true,
              currentTitle: true,
              documentType: true,
              currentAgencyName: true,
              externalDocumentId: true,
            },
          },
          diffs: {
            take: 20,
            orderBy: [{ unitType: "asc" }],
            select: {
              id: true,
              // 법령 상세의 조문 앵커(article-*)를 계산하려면 contentUnitId 가 필요하다.
              // lawDetail 이 articleKey = contentUnitId ?? id 로 쓰는 것과 맞춘다.
              contentUnitId: true,
              changeType: true,
              unitType: true,
              oldLabel: true,
              newLabel: true,
              oldText: true,
              newText: true,
            },
          },
        },
      },
      watch: { select: { id: true } },
      assignedToMember: { select: { id: true, user: { select: { displayName: true, email: true } } } },
      ownerDepartment: { select: { id: true, name: true } },
      tasks: {
        where: { archivedAt: null },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueAt: true,
          _count: { select: { evidence: { where: { deletedAt: null } } } },
        },
      },
    },
  });
}

// 열려있는 아이템 count — 대시보드 카드.
// 제3판 대시보드 — "지금 무엇을 해야 하는가"를 답하려면 시행일 축이 필요하다.
// 아래 두 함수는 읽기 전용 집계일 뿐 스키마·응답 형태를 바꾸지 않는다.

/** 상태별 건수. 목록 상단 탭의 카운트용 (읽기 전용 집계). */
/**
 * 상태 탭에 붙는 건수.
 *
 * 검색어·적용 여부 필터를 같이 받아야 한다. 안 그러면 검색 결과가 0건인데도
 * 탭에는 신규 2 · 검토 중 3 … 이 그대로 남아, 지금 보고 있는 게 걸러진 목록인지
 * 전체인지 탭만 봐서는 알 수 없다. 상태(status)는 일부러 빼고 센다 — 탭 자체가
 * 상태를 고르는 자리라, 고른 상태로 다시 거르면 나머지 탭이 전부 0이 된다.
 */
export async function countInboxByStatus(
  workspaceId: string,
  filters: { search?: string; applicability?: string; ministry?: string } = {},
): Promise<Record<string, number>> {
  const rows = await prisma.changeInboxItem.groupBy({
    by: ["status"],
    where: {
      workspaceId,
      archivedAt: null,
      ...(filters.applicability ? { applicability: filters.applicability } : {}),
      ...(filters.search || filters.ministry
        ? {
            changeEvent: {
              document: {
                ...(filters.search
                  ? { currentTitle: { contains: filters.search, mode: "insensitive" as const } }
                  : {}),
                ...(filters.ministry ? { currentAgencyName: filters.ministry } : {}),
              },
            },
          }
        : {}),
    },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

/** 시행일이 오늘부터 `days` 일 이내인 열린 항목 수. */
export async function countInboxEffectiveWithin(
  workspaceId: string,
  days: number,
): Promise<number> {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  return prisma.changeInboxItem.count({
    where: {
      workspaceId,
      archivedAt: null,
      status: { in: INBOX_OPEN_STATUSES },
      changeEvent: { effectiveDate: { gte: from, lte: to } },
    },
  });
}

export interface UpcomingEffectiveItem {
  id: string;
  documentTitle: string;
  effectiveDate: Date;
}

/** 시행일이 아직 오지 않은 열린 항목. 시행일 오름차순. 대시보드 타임라인용. */
export async function listUpcomingEffective(
  workspaceId: string,
  limit = 5,
): Promise<UpcomingEffectiveItem[]> {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const rows = await prisma.changeInboxItem.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      status: { in: INBOX_OPEN_STATUSES },
      changeEvent: { effectiveDate: { gte: from } },
    },
    orderBy: { changeEvent: { effectiveDate: "asc" } },
    take: limit,
    select: {
      id: true,
      changeEvent: {
        select: { effectiveDate: true, document: { select: { currentTitle: true } } },
      },
    },
  });
  return rows
    .filter((r) => r.changeEvent.effectiveDate !== null)
    .map((r) => ({
      id: r.id,
      documentTitle: r.changeEvent.document.currentTitle,
      effectiveDate: r.changeEvent.effectiveDate as Date,
    }));
}

export async function countOpenInbox(workspaceId: string): Promise<number> {
  return prisma.changeInboxItem.count({
    where: { workspaceId, archivedAt: null, status: { in: INBOX_OPEN_STATUSES } },
  });
}

/**
 * 이 워크스페이스의 변경 알림에 실제로 등장하는 소관부처.
 *
 * 전체 부처는 310개다. 그걸 다 보여주면 "우리 것이 아닌 부처" 를 고르는 데
 * 시간을 쓴다. 내 인박스에 있는 부처만 보여준다 — 고르면 반드시 결과가 있다.
 */
export async function listInboxMinistries(workspaceId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT DISTINCT d.current_agency_name AS name
    FROM change_inbox_item i
    JOIN legal_change_event e ON e.id = i.change_event_id
    JOIN legal_document d ON d.id = e.document_id
    WHERE i.workspace_id = ${workspaceId}
      AND i.archived_at IS NULL
      AND d.current_agency_name IS NOT NULL
    ORDER BY 1`;
  return rows.map((r) => r.name);
}
