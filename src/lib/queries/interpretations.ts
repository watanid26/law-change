// 법령에 딸린 해석례 조회.
//
// 상세 화면 우측에 붙는 목록이라 본문 전체는 필요 없다. 회답 앞머리만
// 잘라 보낸다 — 이유(중앙 2,923자)까지 실어 보내면 쓰지도 않는 텍스트로
// 응답이 무거워진다.

import { prisma } from "@/lib/prisma";
import { formatKoreanDate } from "@/lib/format";

export interface RelatedInterpretation {
  id: string;
  externalId: string;
  title: string;
  /** 회답 앞머리. 목록에서 무엇에 대한 해석인지 가늠하는 용도. */
  answerPreview: string | null;
  date: string;
  agency: string | null;
  officialUrl: string | null;
}

export async function getInterpretationsForLaw(
  documentId: string,
  limit = 8,
): Promise<{ items: RelatedInterpretation[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.legalInterpretationLaw.findMany({
      where: { documentId },
      // 해석일자가 비어 있는 건이 6% 있다. desc 는 Postgres 에서 NULLS FIRST 라
      // 날짜 없는 것이 맨 위로 올라온다 — 최신순이 아니게 된다.
      orderBy: [
        { interpretation: { interpretedAt: { sort: "desc", nulls: "last" } } },
        { interpretation: { registeredAt: { sort: "desc", nulls: "last" } } },
      ],
      take: limit,
      select: {
        interpretation: {
          select: {
            id: true,
            externalId: true,
            title: true,
            answer: true,
            interpretedAt: true,
            registeredAt: true,
            replyAgencyName: true,
            officialUrl: true,
          },
        },
      },
    }),
    prisma.legalInterpretationLaw.count({ where: { documentId } }),
  ]);

  return {
    total,
    items: rows.map((r) => {
      const i = r.interpretation;
      const answer = i.answer?.replace(/\s+/g, " ").trim() ?? "";
      return {
        id: i.id,
        externalId: i.externalId,
        title: i.title,
        answerPreview: answer ? answer.slice(0, 110) + (answer.length > 110 ? "…" : "") : null,
        date: formatKoreanDate(i.interpretedAt ?? i.registeredAt),
        agency: i.replyAgencyName,
        officialUrl: i.officialUrl,
      };
    }),
  };
}
