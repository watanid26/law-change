// 법령해석례 수집기.
//
// 다른 소스와 달리 판·개정 이력이 없다. 확정된 문서 한 건이 전부라서
// "새 ID 를 받고, 기존 건은 내용이 바뀌었는지만 본다" 로 끝난다.
//
// 증분 전략도 다르다. 전체가 8,823건뿐이라 목록 89회 호출 17초면 전수를
// 훑는다. 날짜 창(overlap)을 추측할 필요가 없다 — 매번 전부 훑고 DB 에
// 없는 것만 상세를 받는다. 해석일자와 등록일시가 최대 12년까지 벌어지는
// 소스라, 날짜 기준 증분이었으면 지연 등록분을 통째로 놓쳤을 것이다.

import { prisma } from "@/lib/prisma";
import {
  fetchInterpretationDetail,
  searchInterpretations,
} from "@/lib/interpretation-api/client";
import {
  buildInterpretationUrl,
  computeInterpretationHash,
  extractCitedLawTitles,
  normalizeLawTitle,
  parseInterpretationDate,
} from "@/lib/interpretation-api/normalize";

export interface InterpretationSyncStats {
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  linked: number;
}

/** 법령 제목 → documentId. 가운뎃점 표기가 소스마다 달라 정규화해서 담는다. */
async function loadLawTitleIndex(): Promise<Map<string, string>> {
  const rows = await prisma.legalDocument.findMany({
    select: { id: true, currentTitle: true },
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!r.currentTitle) continue;
    const key = normalizeLawTitle(r.currentTitle);
    // 같은 제목이 여럿이면 먼저 온 것을 쓴다. 제목 중복은 폐지·재제정에서 생긴다.
    if (!map.has(key)) map.set(key, r.id);
  }
  return map;
}

async function syncOne(
  externalId: string,
  lawIndex: Map<string, string>,
): Promise<"created" | "updated" | "unchanged"> {
  const detail = await fetchInterpretationDetail(externalId);
  if (!detail) throw new Error(`No ExpcService for ID=${externalId}`);
  if (String(detail.법령해석례일련번호) !== String(externalId)) {
    throw new Error(
      `ID mismatch: requested ${externalId} but response has ${detail.법령해석례일련번호}`,
    );
  }

  const contentHash = computeInterpretationHash(detail);
  const existing = await prisma.legalInterpretation.findUnique({
    where: { externalId },
    select: { id: true, contentHash: true },
  });
  if (existing && existing.contentHash === contentHash) return "unchanged";

  const data = {
    externalId,
    caseNumber: detail.안건번호?.trim() || null,
    title: detail.안건명.trim(),
    question: detail.질의요지?.trim() || null,
    answer: detail.회답?.trim() || null,
    reasoning: detail.이유?.trim() || null,
    interpretedAt: parseInterpretationDate(detail.해석일자),
    registeredAt: parseInterpretationDate(detail.등록일시),
    replyAgencyName: detail.해석기관명?.trim() || null,
    replyAgencyCode: detail.해석기관코드?.trim() || null,
    inquiryAgencyName: detail.질의기관명?.trim() || null,
    inquiryAgencyCode: detail.질의기관코드?.trim() || null,
    officialUrl: buildInterpretationUrl(externalId),
    contentHash,
  };

  const row = await prisma.legalInterpretation.upsert({
    where: { externalId },
    create: data,
    update: data,
  });

  // 인용 법령 연결. 본문이 바뀌면 인용도 바뀔 수 있으니 다시 만든다.
  const cited = extractCitedLawTitles(detail);
  const links = cited
    .map((title) => ({ title, documentId: lawIndex.get(title) }))
    .filter((x): x is { title: string; documentId: string } => Boolean(x.documentId));
  await prisma.legalInterpretationLaw.deleteMany({ where: { interpretationId: row.id } });
  if (links.length > 0) {
    await prisma.legalInterpretationLaw.createMany({
      data: links.map((l) => ({
        interpretationId: row.id,
        documentId: l.documentId,
        citedTitle: l.title,
      })),
      skipDuplicates: true,
    });
  }

  return existing ? "updated" : "created";
}

export async function syncInterpretations(opts: {
  /** 목록을 몇 페이지까지 훑을지. 생략하면 전부. */
  maxPages?: number;
  /** 이미 있고 내용도 같은 건을 다시 조회하지 않는다. 기본 true. */
  skipKnown?: boolean;
  onProgress?: (s: InterpretationSyncStats) => void;
} = {}): Promise<InterpretationSyncStats> {
  const stats: InterpretationSyncStats = {
    scanned: 0, created: 0, updated: 0, unchanged: 0, failed: 0, linked: 0,
  };
  const lawIndex = await loadLawTitleIndex();
  const known = opts.skipKnown === false
    ? new Set<string>()
    : new Set(
        (await prisma.legalInterpretation.findMany({ select: { externalId: true } }))
          .map((r) => r.externalId),
      );

  const maxPages = opts.maxPages ?? 200;
  for (let page = 1; page <= maxPages; page++) {
    const { items } = await searchInterpretations({ page, display: 100 });
    if (items.length === 0) break;
    for (const it of items) {
      stats.scanned++;
      const id = String(it.법령해석례일련번호 ?? "").trim();
      if (!id) { stats.failed++; continue; }
      if (known.has(id)) { stats.unchanged++; continue; }
      try {
        const r = await syncOne(id, lawIndex);
        stats[r === "created" ? "created" : r === "updated" ? "updated" : "unchanged"]++;
        known.add(id);
      } catch {
        stats.failed++;
      }
    }
    opts.onProgress?.(stats);
  }

  stats.linked = await prisma.legalInterpretationLaw.count();
  return stats;
}
