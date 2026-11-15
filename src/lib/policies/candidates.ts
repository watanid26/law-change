// 사규 본문에서 뽑은 인용을 실제 법령·조문에 맞춘다.
//
// 인용은 "「근로기준법」 제53조" 같은 문언이고, 우리가 이어야 할 것은
// LegalDocument.id 와 LegalContentUnit.id 다. 조문까지 맞출 수 있으면
// 맞춘다 — 개정 영향을 조문 단위로 판정해야 노이즈가 없다.

import { prisma } from "@/lib/prisma";
import { normalizeLawTitle } from "@/lib/interpretation-api/normalize";
import { extractPolicyCitations, type PolicyCitation } from "./citations";

export interface CitationCandidate extends PolicyCitation {
  /** 매칭된 법령. 못 찾으면 null — 그래도 목록에 남겨 "왜 없는지" 를 보여준다. */
  documentId: string | null;
  documentTitle: string | null;
  /** 매칭된 조문. 법령은 찾았는데 조문을 못 찾을 수 있다. */
  contentUnitId: string | null;
  contentUnitLabel: string | null;
  /** 이미 연결돼 있는지 */
  alreadyMapped: boolean;
}

/**
 * 사규 본문 → 연결 후보 목록.
 * 자동으로 연결하지 않는다. 담당자가 고르도록 후보만 만든다.
 */
export async function buildCitationCandidates(
  workspaceId: string,
  policyId: string,
  contentText: string | null | undefined,
): Promise<CitationCandidate[]> {
  const citations = extractPolicyCitations(contentText);
  if (citations.length === 0) return [];

  // 법령 제목은 표기가 갈린다(가운뎃점 등). 후보에 나온 제목만 좁혀 받은 뒤
  // 정규화해서 맞춘다. 2만 7천 건을 전부 들고 오지 않는다.
  const rawTitles = [...new Set(citations.map((c) => c.rawTitle))];
  const docs = await prisma.legalDocument.findMany({
    where: { currentTitle: { in: rawTitles } },
    select: { id: true, currentTitle: true },
  });
  const byTitle = new Map<string, { id: string; title: string }>();
  for (const d of docs) {
    if (!d.currentTitle) continue;
    const key = normalizeLawTitle(d.currentTitle);
    if (!byTitle.has(key)) byTitle.set(key, { id: d.id, title: d.currentTitle });
  }

  // 표기가 달라 위에서 못 잡힌 것은 가운뎃점을 뺀 형태로 한 번 더 찾는다.
  const missing = citations.filter((c) => !byTitle.has(c.normalizedTitle));
  if (missing.length > 0) {
    const loose = await prisma.legalDocument.findMany({
      where: {
        OR: missing.map((c) => ({
          currentTitle: { contains: c.rawTitle.replace(/[ㆍ·]/g, "") },
        })),
      },
      select: { id: true, currentTitle: true },
      take: 200,
    });
    for (const d of loose) {
      if (!d.currentTitle) continue;
      const key = normalizeLawTitle(d.currentTitle);
      if (!byTitle.has(key)) byTitle.set(key, { id: d.id, title: d.currentTitle });
    }
  }

  // 조문 맞추기. currentLabel 이 "제53조" 형태다.
  const wanted = citations
    .map((c) => ({ c, doc: byTitle.get(c.normalizedTitle) }))
    .filter((x) => x.doc && x.c.articleLabel);
  const units =
    wanted.length > 0
      ? await prisma.legalContentUnit.findMany({
          where: {
            OR: wanted.map((x) => ({
              documentId: x.doc!.id,
              currentLabel: x.c.articleLabel!,
            })),
          },
          select: { id: true, documentId: true, currentLabel: true, currentTitle: true },
        })
      : [];
  const unitKey = (docId: string, label: string) => `${docId} ${label}`;
  const byUnit = new Map(units.map((u) => [unitKey(u.documentId, u.currentLabel ?? ""), u]));

  const existing = await prisma.legalPolicyMapping.findMany({
    where: { workspaceId, policyId },
    select: { documentId: true, contentUnitId: true },
  });
  const mapped = new Set(existing.map((m) => `${m.documentId} ${m.contentUnitId ?? ""}`));

  return citations.map((c) => {
    const doc = byTitle.get(c.normalizedTitle) ?? null;
    const unit =
      doc && c.articleLabel ? byUnit.get(unitKey(doc.id, c.articleLabel)) ?? null : null;
    return {
      ...c,
      documentId: doc?.id ?? null,
      documentTitle: doc?.title ?? null,
      contentUnitId: unit?.id ?? null,
      contentUnitLabel: unit
        ? unit.currentTitle
          ? `${unit.currentLabel}(${unit.currentTitle})`
          : unit.currentLabel
        : null,
      alreadyMapped: doc ? mapped.has(`${doc.id} ${unit?.id ?? ""}`) : false,
    };
  });
}
