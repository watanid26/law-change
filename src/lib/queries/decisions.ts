// 법령에 딸린 행정기관 결정문 조회.
//
// 사이드바 목록이라 본문 전체는 안 보낸다. 주문(무엇을 하라고 정했는지)
// 앞머리만 자른다 — ftc 이유는 중앙 3,229자, 최대 5만 자가 넘는다.

import { prisma } from "@/lib/prisma";
import { formatKoreanDate } from "@/lib/format";

export interface RelatedDecision {
  id: string;
  source: "PPC" | "FTC";
  sourceLabel: string;
  title: string;
  /** 주문 → 없으면 결정요지. 둘 다 없는 건이 실재한다(ppc 51%). */
  preview: string | null;
  date: string;
  officialUrl: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  PPC: "개인정보위",
  FTC: "공정위",
};

export async function getDecisionsForLaw(
  documentId: string,
  limit = 6,
): Promise<{ items: RelatedDecision[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.agencyDecisionLaw.findMany({
      where: { documentId },
      // 결정일자가 비어 있는 건이 있다(ppc 6.2% · ftc 0.7%).
      // desc 는 NULLS FIRST 라 날짜 없는 것이 맨 위로 온다 — 최신순이 깨진다.
      orderBy: [{ decision: { decidedAt: { sort: "desc", nulls: "last" } } }],
      take: limit,
      select: {
        decision: {
          select: {
            id: true, source: true, title: true, disposition: true,
            summary: true, decidedAt: true, officialUrl: true,
          },
        },
      },
    }),
    prisma.agencyDecisionLaw.count({ where: { documentId } }),
  ]);

  return {
    total,
    items: rows.map((r) => {
      const d = r.decision;
      const body = (d.disposition ?? d.summary ?? "").replace(/\s+/g, " ").trim();
      return {
        id: d.id,
        source: d.source as "PPC" | "FTC",
        sourceLabel: SOURCE_LABEL[d.source] ?? d.source,
        title: d.title,
        preview: body ? body.slice(0, 110) + (body.length > 110 ? "…" : "") : null,
        date: formatKoreanDate(d.decidedAt),
        officialUrl: d.officialUrl,
      };
    }),
  };
}
