// 행정규칙(고시) 상세 수집기 (Schema v7)

import {
  fetchAdminRuleDetail,
  fetchAdminRuleDetailByRuleId,
  searchAdminRules,
} from "@/lib/admin-rule-api/client";
import {
  computeAdminRuleDocumentHash,
  extractEffectiveDate,
  extractAdminRuleArticleTexts,
  extractAdminRuleAttachments,
  normalizeAdminRuleArticles,
} from "@/lib/admin-rule-api/normalize";
import {
  parseApiDate,
  resolveEffectiveDate,
  type NormalizedArticle,
} from "@/lib/law-api/normalize";
import { buildPublicOfficialUrl } from "@/lib/law-api/officialUrl";
import { getLegalSourceId } from "@/lib/law-api/sources";
import { prisma } from "@/lib/prisma";
import { diffContentUnits } from "./diff";
import { createVersionTolerantly, refreshLastChangeAt } from "./versionUpsert";

export interface DetailSyncStats {
  documentId: string;
  documentTitle: string;
  versionsCollected: number;
  changeEventsCreated: number;
}

export type DiscoveryType = "HISTORICAL_IMPORT" | "LIVE_DETECTION" | "RECONCILIATION_RECOVERY";

export async function syncAdminRuleDocument(
  externalDocumentId: string,
  latestSerialHint?: string,
  titleHint?: string,
  discoveryType: DiscoveryType = "LIVE_DETECTION",
): Promise<DetailSyncStats> {
  const legalSourceId = await getLegalSourceId("ADMIN_RULE");

  let serial = latestSerialHint;
  if (!serial) {
    serial = await resolveLatestSerial(externalDocumentId, titleHint);
  }
  // 일련번호를 못 구해도 포기하지 않는다. 상세 API 가 행정규칙ID 를 직접 받는
  // 경로(LID)가 있고, 그 응답에 일련번호가 들어 있다.
  const detail = serial
    ? await fetchAdminRuleDetail(serial)
    : await fetchAdminRuleDetailByRuleId(externalDocumentId);
  const info = detail.AdmRulService?.행정규칙기본정보;
  if (!info) {
    throw new Error(
      `No 행정규칙기본정보 for externalDocumentId=${externalDocumentId} (serial=${serial ?? "미확인"})`,
    );
  }
  if (info.행정규칙ID && String(info.행정규칙ID) !== String(externalDocumentId)) {
    throw new Error(
      `ID mismatch: requested externalDocumentId=${externalDocumentId} but response has 행정규칙ID=${info.행정규칙ID}`,
    );
  }

  const doc = await prisma.legalDocument.upsert({
    where: { legalSourceId_externalDocumentId: { legalSourceId, externalDocumentId } },
    create: {
      legalSourceId,
      externalDocumentId,
      documentType: info.행정규칙종류,
      documentTypeCode: info.행정규칙종류코드 ?? null,
      currentTitle: info.행정규칙명.trim(),
      currentAgencyName: info.소관부처명,
      currentAgencyCode: info.소관부처코드 ?? null,
      officialUrl: buildPublicOfficialUrl("ADMIN_RULE", externalDocumentId, info.행정규칙명),
    },
    update: {
      currentTitle: info.행정규칙명.trim(),
      currentAgencyName: info.소관부처명,
      currentAgencyCode: info.소관부처코드 ?? null,
      documentType: info.행정규칙종류,
      documentTypeCode: info.행정규칙종류코드 ?? null,
      lastCheckedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  const normalized = normalizeAdminRuleArticles(extractAdminRuleArticleTexts(detail.AdmRulService));
  const contentHash = computeAdminRuleDocumentHash(normalized);
  const eff = extractEffectiveDate(detail.AdmRulService.부칙);

  // v13: 유일키에 시행일이 들어갔다. 행정규칙은 분할시행이 드물지만 키가
  // 같아야 하므로 같은 조건으로 찾는다.
  // 행정규칙은 부칙이 상세 응답에 같이 오므로 자리표시 값을 보정할 수 있다.
  const effectiveDate = resolveEffectiveDate(parseApiDate(info.시행일자) ?? eff.date, {
    promulgationDate: parseApiDate(info.발령일자),
    addendumText: eff.text,
  });
  const existingVersion = await prisma.legalDocumentVersion.findFirst({
    where: {
      documentId: doc.id,
      externalVersionId: info.행정규칙일련번호,
      effectiveDate,
    },
    include: { contentUnitVersions: true },
  });

  let versionRow;
  let versionsCollected = 0;
  if (existingVersion) {
    versionRow = existingVersion;
    // 파서가 본문을 못 읽던 시절에 만들어진 "조문 0개" 판이 실재한다.
    // (국무총리훈령·대통령훈령은 본문이 조문 블록에 와서 159건이 이 상태였다.)
    // 판이 있다는 이유로 그냥 넘기면 영원히 빈 채로 남으므로, 지금 본문이
    // 읽히면 그 판을 채워준다. 이벤트는 이미 있으니 새로 만들지 않는다.
    if (existingVersion.contentUnitVersions.length === 0 && normalized.length > 0) {
      await writeContentUnits(doc.id, existingVersion.id, normalized);
      await prisma.legalDocumentVersion.update({
        where: { id: existingVersion.id },
        data: { contentHash },
      });
    }
  } else {
    const previous = await prisma.legalDocumentVersion.findFirst({
      where: {
        documentId: doc.id,
        NOT: { externalVersionId: info.행정규칙일련번호 },
      },
      // desc 는 NULLS FIRST 다. 발령일 없는 버전이 "직전 판" 으로 뽑히면
      // 엉뚱한 판과 비교해 diff 가 통째로 틀린다.
      orderBy: [
        { issuanceDate: { sort: "desc", nulls: "last" } },
        { collectedAt: "desc" },
      ],
      include: { contentUnitVersions: true },
    });

    versionRow = await createVersionTolerantly({
      documentId: doc.id,
      externalVersionId: info.행정규칙일련번호,
      revisionSequence: previous ? previous.revisionSequence + 1 : 0,
      revisionType: info.제개정구분명,
      titleSnapshot: info.행정규칙명.trim(),
      agencyNameSnapshot: info.소관부처명,
      agencyCodeSnapshot: info.소관부처코드 ?? null,
      issuanceNumber: info.발령번호 || null,
      issuanceDate: parseApiDate(info.발령일자),
      effectiveDate,
      effectiveDateText: eff.text,
      contentHash,
    });

    await writeContentUnits(doc.id, versionRow.id, normalized);
    versionsCollected = 1;

    const already = await prisma.legalChangeEvent.findUnique({
      where: { newVersionId: versionRow.id },
    });
    if (!already) {
      const notifyEligible = discoveryType === "LIVE_DETECTION";
      if (previous) {
        // 이전 unitVersion 데이터를 NormalizedArticle 형태로 변환
        const prevCuIds = previous.contentUnitVersions.map((c) => c.contentUnitId);
        const prevUnits = await prisma.legalContentUnit.findMany({
          where: { id: { in: prevCuIds } },
          select: { id: true, canonicalKey: true },
        });
        const cuIdToKey = new Map(prevUnits.map((u) => [u.id, u.canonicalKey]));
        const previousArticles: NormalizedArticle[] = previous.contentUnitVersions
          .sort((a, b) => a.unitOrder - b.unitOrder)
          .map((cv) => ({
            articleKey: cuIdToKey.get(cv.contentUnitId) ?? cv.sourceKey,
            articleNumber: cv.unitNumber ?? "",
            articleTitle: cv.unitTitle,
            articleText: cv.contentText,
            articleHash: cv.contentHash,
            articleOrder: cv.unitOrder,
            effectiveDate: cv.effectiveDate,
            isMovedFrom: null,
            isMovedTo: null,
            isRealArticle: true,
          }));
        const { diffs, counts } = diffContentUnits(previousArticles, normalized);
        await prisma.legalChangeEvent.create({
          data: {
            documentId: doc.id,
            previousVersionId: previous.id,
            newVersionId: versionRow.id,
            eventType: mapEventType(info.제개정구분명),
            discoveryType,
            notificationEligible: notifyEligible,
            issuanceDate: parseApiDate(info.발령일자),
            effectiveDate,
            effectiveDateText: eff.text,
            totalDiffCount: diffs.length,
            addedCount: counts.added,
            modifiedCount: counts.modified,
            deletedCount: counts.deleted,
            movedCount: counts.moved,
            diffs: {
              create: await Promise.all(
                diffs.map(async (d) => ({
                  contentUnitId: await resolveContentUnitId(doc.id, d.articleKey),
                  unitType: "ARTICLE",
                  changeType: d.changeType,
                  oldLabel: d.articleNumber,
                  newLabel: d.articleNumber,
                  oldText: d.oldText,
                  newText: d.newText,
                  diffOperations: d.diffOperations as unknown as object,
                })),
              ),
            },
          },
        });
        return {
          documentId: doc.id,
          documentTitle: doc.currentTitle,
          versionsCollected,
          changeEventsCreated: 1,
        };
      } else {
        await prisma.legalChangeEvent.create({
          data: {
            documentId: doc.id,
            previousVersionId: null,
            newVersionId: versionRow.id,
            eventType: "FIRST_ISSUE",
            discoveryType,
            notificationEligible: notifyEligible,
            issuanceDate: parseApiDate(info.발령일자),
            effectiveDate,
            effectiveDateText: eff.text,
            totalDiffCount: normalized.length,
            addedCount: normalized.length,
            modifiedCount: 0,
            deletedCount: 0,
            movedCount: 0,
          },
        });
        return {
          documentId: doc.id,
          documentTitle: doc.currentTitle,
          versionsCollected,
          changeEventsCreated: 1,
        };
      }
    }
  }

  // 목록의 기본 정렬(최근 개정순)이 쓰는 값. 여기서 안 올리면 새 개정이
  // 목록 맨 위로 올라오지 않는다.
  await refreshLastChangeAt(doc.id);

  await syncAttachments(doc.id, versionRow.id, extractAdminRuleAttachments(detail.AdmRulService));

  return {
    documentId: doc.id,
    documentTitle: doc.currentTitle,
    versionsCollected,
    changeEventsCreated: 0,
  };
}

// 조문 유닛 + 유닛 버전 기록. 새 판을 만들 때와, 과거에 빈 채로 만들어진 판을
// 뒤늦게 채울 때 양쪽에서 쓴다.
async function writeContentUnits(
  documentId: string,
  versionId: string,
  articles: NormalizedArticle[],
): Promise<void> {
  for (const a of articles) {
    const unit = await prisma.legalContentUnit.upsert({
      where: {
        documentId_unitType_canonicalKey: {
          documentId,
          unitType: "ARTICLE",
          canonicalKey: a.articleKey,
        },
      },
      create: {
        documentId,
        unitType: "ARTICLE",
        canonicalKey: a.articleKey,
        currentLabel: a.articleNumber,
        // v15: 개정 신호가 "바뀐 조문이 벌칙 조문인가" 를 물으려면
        // 제목이 유닛에 있어야 한다. 버전 테이블로는 인덱스를 못 탄다.
        currentTitle: a.articleTitle,
        firstSeenVersionId: versionId,
        lastSeenVersionId: versionId,
      },
      update: {
        currentLabel: a.articleNumber,
        currentTitle: a.articleTitle,
        lastSeenVersionId: versionId,
      },
    });
    await prisma.legalContentUnitVersion.create({
      data: {
        documentId,
        contentUnitId: unit.id,
        documentVersionId: versionId,
        sourceKey: a.articleKey,
        unitNumber: a.articleNumber,
        unitTitle: a.articleTitle,
        unitOrder: a.articleOrder,
        contentText: a.articleText,
        contentHash: a.articleHash,
        effectiveDate: a.effectiveDate,
      },
    });
  }
}

// 첨부 파일 기록. 같은 판을 다시 수집해도 중복이 쌓이지 않도록, 이미 기록된
// 판이면 건너뛴다.
async function syncAttachments(
  documentId: string,
  versionId: string,
  files: { fileName: string; sourceUrl: string }[],
): Promise<void> {
  if (files.length === 0) return;
  const existing = await prisma.legalAttachment.count({ where: { documentVersionId: versionId } });
  if (existing > 0) return;
  await prisma.legalAttachment.createMany({
    data: files.map((f) => ({
      documentId,
      documentVersionId: versionId,
      attachmentType: "FILE",
      fileName: f.fileName,
      sourceUrl: f.sourceUrl,
    })),
  });
}

async function resolveLatestSerial(externalDocumentId: string, titleHint?: string): Promise<string | undefined> {
  const query = titleHint;
  if (!query) return undefined;
  const { items } = await searchAdminRules({ query, display: 30 });
  const match = items.find((item) => String(item.행정규칙ID) === String(externalDocumentId));
  return match?.행정규칙일련번호;
}

async function resolveContentUnitId(documentId: string, canonicalKey: string): Promise<string | null> {
  const row = await prisma.legalContentUnit.findUnique({
    where: {
      documentId_unitType_canonicalKey: { documentId, unitType: "ARTICLE", canonicalKey },
    },
    select: { id: true },
  });
  return row?.id ?? null;
}

function mapEventType(revisionType: string): string {
  if (revisionType.includes("제정")) return "FIRST_ISSUE";
  if (revisionType.includes("폐지")) return "REPEAL";
  return "REVISION";
}
