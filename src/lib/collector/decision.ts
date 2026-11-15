// 개인정보위(PPC) · 공정위(FTC) 결정문 수집기.
//
// 해석례와 같은 성격이다 — 판·개정 이력이 없는 확정 문서 한 건. 그래서
// 증분도 같은 방식이다. ppc 4,127건(목록 42회 8초) · ftc 8,254건(83회 18초)
// 이라 매번 전수를 훑고 DB 에 없는 것만 상세를 받는다.
//
// 다만 품질 기대치는 소스마다 다르다(실측 표본 60건 기준).
//   FTC — 이유 중앙 3,229자 · 본문이 사실상 없는 건 2% · 법령 연결 27%
//   PPC — 이유 중앙 30자 · 본문이 사실상 없는 건 51% · 법령 연결 73%
// PPC 는 본문이 이미지 별지에 있는 건이 30% 라 텍스트로는 못 가져온다.

import { prisma } from "@/lib/prisma";
import {
  fetchDecisionDetail,
  searchDecisions,
  type DecisionSource,
} from "@/lib/decision-api/client";
import { buildDecisionUrl, normalizeDecision } from "@/lib/decision-api/normalize";
import { normalizeLawTitle } from "@/lib/interpretation-api/normalize";

export interface DecisionSyncStats {
  source: DecisionSource;
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** 본문(주문·요지·이유)이 하나도 없는 건. 소스 품질을 눈으로 보기 위한 값. */
  empty: number;
  linked: number;
}

async function loadLawTitleIndex(): Promise<Map<string, string>> {
  const rows = await prisma.legalDocument.findMany({ select: { id: true, currentTitle: true } });
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!r.currentTitle) continue;
    const key = normalizeLawTitle(r.currentTitle);
    if (!map.has(key)) map.set(key, r.id);
  }
  return map;
}

async function syncOne(
  source: DecisionSource,
  externalId: string,
  lawIndex: Map<string, string>,
): Promise<{ result: "created" | "updated" | "unchanged"; empty: boolean }> {
  const raw = await fetchDecisionDetail(source, externalId);
  if (!raw) throw new Error(`No detail for ${source}/${externalId}`);
  const n = normalizeDecision(source, externalId, raw);
  const empty = !n.disposition && !n.summary && !n.reasoning;

  const existing = await prisma.agencyDecision.findUnique({
    where: { source_externalId: { source, externalId } },
    select: { id: true, contentHash: true },
  });
  if (existing && existing.contentHash === n.contentHash) {
    return { result: "unchanged", empty };
  }

  const data = {
    source,
    externalId,
    caseNumber: n.caseNumber,
    title: n.title,
    decidedAt: n.decidedAt,
    disposition: n.disposition,
    summary: n.summary,
    reasoning: n.reasoning,
    meetingType: n.meetingType,
    decisionType: n.decisionType,
    officialUrl: buildDecisionUrl(source, externalId),
    // 소스마다 다른 나머지 필드는 그대로 남긴다. 나중에 쓸 값을 지금 버리지 않는다.
    rawFields: raw as object,
    contentHash: n.contentHash,
  };
  const row = await prisma.agencyDecision.upsert({
    where: { source_externalId: { source, externalId } },
    create: data,
    update: data,
  });

  const links = n.citedLawTitles
    .map((title) => ({ title, documentId: lawIndex.get(title) }))
    .filter((x): x is { title: string; documentId: string } => Boolean(x.documentId));
  await prisma.agencyDecisionLaw.deleteMany({ where: { decisionId: row.id } });
  if (links.length > 0) {
    await prisma.agencyDecisionLaw.createMany({
      data: links.map((l) => ({
        decisionId: row.id,
        documentId: l.documentId,
        citedTitle: l.title,
      })),
      skipDuplicates: true,
    });
  }
  return { result: existing ? "updated" : "created", empty };
}

export async function syncDecisions(
  source: DecisionSource,
  opts: { maxPages?: number; onProgress?: (s: DecisionSyncStats) => void } = {},
): Promise<DecisionSyncStats> {
  const stats: DecisionSyncStats = {
    source, scanned: 0, created: 0, updated: 0, unchanged: 0, failed: 0, empty: 0, linked: 0,
  };
  const lawIndex = await loadLawTitleIndex();
  const known = new Set(
    (await prisma.agencyDecision.findMany({ where: { source }, select: { externalId: true } }))
      .map((r) => r.externalId),
  );

  const maxPages = opts.maxPages ?? 200;
  for (let page = 1; page <= maxPages; page++) {
    const items = await searchDecisions(source, page);
    if (items.length === 0) break;
    for (const it of items) {
      stats.scanned++;
      const id = String(it.결정문일련번호 ?? "").trim();
      if (!id) { stats.failed++; continue; }
      if (known.has(id)) { stats.unchanged++; continue; }
      try {
        const r = await syncOne(source, id, lawIndex);
        stats[r.result === "created" ? "created" : r.result === "updated" ? "updated" : "unchanged"]++;
        if (r.empty) stats.empty++;
        known.add(id);
      } catch {
        stats.failed++;
      }
    }
    opts.onProgress?.(stats);
  }

  stats.linked = await prisma.agencyDecisionLaw.count();
  return stats;
}
