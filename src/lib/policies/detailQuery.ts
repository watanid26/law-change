// 사규 상세에 필요한 것들.

import { prisma } from "@/lib/prisma";
import { formatKoreanDate } from "@/lib/format";
import { buildCitationCandidates, type CitationCandidate } from "./candidates";

export interface PolicyMappingRow {
  mappingId: string;
  documentId: string;
  documentTitle: string;
  externalDocumentId: string;
  unitLabel: string | null;
  unitTitle: string | null;
  /** 연결된 조문(또는 법령)이 마지막으로 바뀐 날 */
  lastChangeAt: string | null;
}

export interface PolicyDetail {
  id: string;
  title: string;
  type: string;
  status: string;
  externalUrl: string | null;
  contentText: string | null;
  contentSavedAt: string | null;
  mappings: PolicyMappingRow[];
  candidates: CitationCandidate[];
}

export async function getPolicyDetail(
  workspaceId: string,
  policyId: string,
): Promise<PolicyDetail | null> {
  const policy = await prisma.internalPolicy.findFirst({
    where: { id: policyId, workspaceId },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      externalUrl: true,
      versions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { contentText: true, createdAt: true },
      },
    },
  });
  if (!policy) return null;

  const latest = policy.versions[0] ?? null;
  const contentText = latest?.contentText ?? null;

  const mappingRows = await prisma.legalPolicyMapping.findMany({
    where: { workspaceId, policyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      documentId: true,
      document: {
        select: { currentTitle: true, externalDocumentId: true, lastChangeAt: true },
      },
      contentUnit: { select: { currentLabel: true, currentTitle: true } },
    },
  });

  const mappings: PolicyMappingRow[] = mappingRows.map((m) => ({
    mappingId: m.id,
    documentId: m.documentId,
    documentTitle: m.document.currentTitle ?? "(제목 없음)",
    externalDocumentId: m.document.externalDocumentId,
    unitLabel: m.contentUnit?.currentLabel ?? null,
    unitTitle: m.contentUnit?.currentTitle ?? null,
    lastChangeAt: m.document.lastChangeAt ? formatKoreanDate(m.document.lastChangeAt) : null,
  }));

  // 본문이 없으면 후보를 만들 수 없다. 화면이 "본문을 넣어달라" 고 안내한다.
  const candidates = contentText
    ? await buildCitationCandidates(workspaceId, policyId, contentText)
    : [];

  return {
    id: policy.id,
    title: policy.title,
    type: policy.type,
    status: policy.status,
    externalUrl: policy.externalUrl,
    contentText,
    contentSavedAt: latest?.createdAt ? formatKoreanDate(latest.createdAt) : null,
    mappings,
    candidates,
  };
}
