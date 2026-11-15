// "최근 개정" 피드 — 로그인 없이 볼 수 있는 공개 자료.
//
// /laws 목록의 `recent` 정렬은 lastSeenAt(수집기가 마지막으로 확인한 시각) 기준이라
// "무엇이 실제로 바뀌었는가"와는 다른 축이었다. 사용자가 원하는 "날짜순 신규 변경"은
// 문서 목록이 아니라 **개정 이벤트** 목록이다. 그래서 LegalChangeEvent 를 직접 읽는다.
//
// 정렬 기준은 공포일(promulgationDate). 공포일이 없는 건(고시 등 일부)은 감지일로
// 대체한다 — 목록에서 날짜가 비어 보이는 것보다 낫다.
//
// 정렬 버그(2026-08): orderBy [{promulgationDate:"desc"},{detectedAt:"desc"}] 로
// 두면 Postgres 의 DESC 기본값이 NULLS FIRST 라서 공포일이 없는 이벤트
// 10,250건(전체의 9.1%)이 목록 맨 앞을 통째로 차지했다. 342페이지를 넘겨야
// 공포일이 있는 첫 건이 나온다. 게다가 그 구간은 detectedAt 값이 며칠뿐이라
// 사실상 동률이고, 동률 안에서는 순서가 정해져 있지 않아 매번 제멋대로였다.
// 화면에 보이는 날짜는 COALESCE(공포일, 감지일) 이므로 정렬도 같은 식으로
// 해야 "날짜순" 이라는 설명이 참이 된다. Prisma orderBy 는 식 정렬을 못 해서
// 이 목록만 raw SQL 로 내린다. 동률 tiebreak 은 id 로 고정해 페이지를 넘겨도
// 같은 건이 두 번 나오거나 건너뛰지 않게 한다.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RecentChangesSort } from "./recentChangesSort";

export { parseRecentChangesSort } from "./recentChangesSort";
export type { RecentChangesSort } from "./recentChangesSort";

export interface RecentChangeItem {
  eventId: string;
  sourceId: string;
  documentTitle: string;
  documentType: string;
  ministry: string | null;
  eventType: string;
  /** 정렬·표시에 쓰는 대표 날짜. 공포일이 있으면 공포일, 없으면 감지일. */
  changedAt: Date;
  /** 공포일이 없어 감지일로 대체했는지. 화면에서 라벨을 다르게 쓴다. */
  isDetectedFallback: boolean;
  effectiveDate: Date | null;
  totalDiffCount: number;
  /** 비교할 이전 판이 있는지. 없으면 "변경" 이 아니라 최초 수집이다. */
  hasPrevious: boolean;
}

export interface RecentChangesQuery {
  /** 소관부처 필터. /laws 와 같은 파라미터명(ministry)을 쓴다. */
  ministry?: string;
  documentType?: string;
  sort?: RecentChangesSort;
  page?: number;
  pageSize?: number;
}

interface RecentChangeRow {
  id: string;
  event_type: string;
  promulgation_date: Date | null;
  effective_date: Date | null;
  detected_at: Date;
  total_diff_count: number;
  previous_version_id: string | null;
  external_document_id: string;
  current_title: string;
  document_type: string;
  current_agency_name: string | null;
}

export async function listRecentChanges(q: RecentChangesQuery = {}): Promise<{
  items: RecentChangeItem[];
  total: number;
  pageSize: number;
}> {
  const pageSize = Math.min(q.pageSize ?? 30, 100);
  const page = Math.max(1, q.page ?? 1);
  const sort = q.sort ?? "changed";

  const where = {
    status: "PUBLISHED" as const,
    document: {
      ...(q.ministry ? { currentAgencyName: q.ministry } : {}),
      ...(q.documentType ? { documentType: q.documentType } : {}),
    },
  };

  // 필터는 count 와 목록이 반드시 같아야 하므로 한 곳에서 만든다.
  const conds: Prisma.Sql[] = [Prisma.sql`e.status = 'PUBLISHED'`];
  if (q.ministry) conds.push(Prisma.sql`d.current_agency_name = ${q.ministry}`);
  if (q.documentType) conds.push(Prisma.sql`d.document_type = ${q.documentType}`);
  const whereSql = Prisma.join(conds, " AND ");

  // 시행일순은 "아직 안 온 시행일이 가까운 것부터". 이미 지난 시행일과 미정은
  // 뒤로 보낸다 — 여기서 찾는 건 앞으로 대비해야 할 것이기 때문.
  const orderSql =
    sort === "effective"
      ? Prisma.sql`
          (e.effective_date IS NULL) ASC,
          (e.effective_date < CURRENT_DATE) ASC,
          e.effective_date ASC,
          e.id ASC`
      : Prisma.sql`
          -- 화면은 서울 날짜로 찍는데 ::date 를 그냥 쓰면 UTC 로 잘려서,
          -- 한국시간 00~09시 감지 건이 하루 앞 묶음에 들어가 머리글이
          -- 8.26 → 8.27 → 8.25 처럼 튄다. 자르는 기준도 서울로 맞춘다.
          ((COALESCE(e.promulgation_date, e.detected_at) AT TIME ZONE 'UTC')
            AT TIME ZONE 'Asia/Seoul')::date DESC,
          -- 같은 날짜 안에서는 id 로 잘랐더니 사실상 제목 역순이 나왔다
          -- ("희소 → 희귀 → 흡연 → 훈련"). 공포일이 없는 고시가 하루에 수천 건씩
          -- 몰려 있어서 그 구간이 몇백 페이지나 이어진다. 같은 날이라면
          -- 아직 안 온 시행일이 가까운 것부터, 그다음 이미 시행된 것 중
          -- 최근 것부터 — 대비할 일이 남은 것을 앞에 둔다.
          (e.effective_date IS NULL) ASC,
          (e.effective_date < CURRENT_DATE) ASC,
          CASE WHEN e.effective_date >= CURRENT_DATE THEN e.effective_date END
            ASC NULLS LAST,
          e.effective_date DESC,
          e.id DESC`;

  const [rows, total] = await Promise.all([
    prisma.$queryRaw<RecentChangeRow[]>`
      SELECT e.id, e.event_type, e.promulgation_date, e.effective_date,
             e.detected_at, e.total_diff_count, e.previous_version_id,
             d.external_document_id, d.current_title, d.document_type,
             d.current_agency_name
      FROM legal_change_event e
      JOIN legal_document d ON d.id = e.document_id
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    prisma.legalChangeEvent.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      eventId: r.id,
      sourceId: r.external_document_id,
      documentTitle: r.current_title,
      documentType: r.document_type,
      ministry: r.current_agency_name,
      eventType: r.event_type,
      changedAt: r.promulgation_date ?? r.detected_at,
      isDetectedFallback: r.promulgation_date === null,
      effectiveDate: r.effective_date,
      totalDiffCount: Number(r.total_diff_count),
      hasPrevious: r.previous_version_id !== null,
    })),
    total,
    pageSize,
  };
}

/** 소관부처 상위 N개 (문서 수 기준). /laws 의 부처별 진입 칩에 쓴다. */
export async function listTopMinistries(limit = 12): Promise<
  { name: string; count: number }[]
> {
  const rows = await prisma.legalDocument.groupBy({
    by: ["currentAgencyName"],
    _count: { _all: true },
    orderBy: { _count: { currentAgencyName: "desc" } },
    take: limit + 1,
  });
  return rows
    .filter((r) => r.currentAgencyName)
    .slice(0, limit)
    .map((r) => ({ name: r.currentAgencyName as string, count: r._count._all }));
}
