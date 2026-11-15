// 서비스가 어디까지 담고 있는지. 숫자를 문구에 박아두면 반드시 낡는다 —
// 매번 DB 에서 센다. 자주 바뀌지 않으므로 한 시간 캐시한다.

import { prisma } from "@/lib/prisma";
import { formatKoreanDate } from "@/lib/format";

export interface CoverageSummary {
  law: { documents: number; changes: number; since: string | null };
  adminRule: { documents: number; changes: number; since: string | null };
  interpretations: number;
  decisions: number;
  /** 마지막으로 수집이 성공한 시각. "언제 기준 데이터인가" 에 답한다. */
  lastSyncedAt: string | null;
}

export const revalidate = 3600;

export async function getCoverageSummary(): Promise<CoverageSummary> {
  const [lawDocs, ruleDocs, lawEv, ruleEv, itp, dec, lastRun] = await Promise.all([
    prisma.legalDocument.count({ where: { legalSource: { sourceType: "LAW" } } }),
    prisma.legalDocument.count({ where: { legalSource: { sourceType: "ADMIN_RULE" } } }),
    prisma.legalChangeEvent.aggregate({
      where: { document: { legalSource: { sourceType: "LAW" } } },
      _count: { _all: true },
      _min: { promulgationDate: true },
    }),
    prisma.legalChangeEvent.aggregate({
      where: { document: { legalSource: { sourceType: "ADMIN_RULE" } } },
      _count: { _all: true },
      _min: { effectiveDate: true },
    }),
    prisma.legalInterpretation.count(),
    prisma.agencyDecision.count(),
    prisma.collectorRun.findFirst({
      where: { status: { in: ["SUCCESS", "PARTIAL"] }, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);

  return {
    law: {
      documents: lawDocs,
      changes: lawEv._count._all,
      since: lawEv._min.promulgationDate ? formatKoreanDate(lawEv._min.promulgationDate) : null,
    },
    adminRule: {
      documents: ruleDocs,
      changes: ruleEv._count._all,
      since: ruleEv._min.effectiveDate ? formatKoreanDate(ruleEv._min.effectiveDate) : null,
    },
    interpretations: itp,
    decisions: dec,
    lastSyncedAt: lastRun?.finishedAt ? formatKoreanDate(lastRun.finishedAt) : null,
  };
}
