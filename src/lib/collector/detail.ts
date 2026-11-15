// 문서 상세 수집기 (Schema v7)
// queue에서 원자적으로 잡을 뽑아 sourceType별 로직으로 처리.
// LegalDocument는 (legalSourceId, externalDocumentId) unique, ContentUnit 구조 사용.

import type { LawListItem } from "@/lib/law-api/types";
import { fetchEflawDetail, fetchLawDetail, searchLaws } from "@/lib/law-api/client";
import {
  computeDocumentHash,
  normalizeArticles,
  resolveEffectiveDate,
  selectStorableArticles,
  parseApiDate,
  type NormalizedArticle,
} from "@/lib/law-api/normalize";
import { buildPublicOfficialUrl } from "@/lib/law-api/officialUrl";
import { getLegalSourceId } from "@/lib/law-api/sources";
import { prisma } from "@/lib/prisma";
import { diffContentUnits } from "./diff";
import {
  claimPendingJobs,
  makeWorkerId,
  markJobDone,
  markJobFailed,
  type ClaimedJob,
} from "./queue";
import { syncAdminRuleDocument } from "./admin-rule-detail";
import { createVersionTolerantly, refreshLastChangeAt } from "./versionUpsert";

export interface DetailSyncStats {
  documentId: string;
  documentTitle: string;
  versionsCollected: number;
  changeEventsCreated: number;
}

export async function processCollectorJobs(
  limit: number = 10,
  workerLabel?: string,
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  dead: number;
  stats: DetailSyncStats[];
}> {
  const workerId = makeWorkerId(workerLabel);
  const jobs = await claimPendingJobs(workerId, limit);

  let succeeded = 0;
  let failed = 0;
  let dead = 0;
  const stats: DetailSyncStats[] = [];

  for (const job of jobs) {
    try {
      const stat = await runJob(job);
      stats.push(stat);
      await markJobDone(job.id);
      succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const outcome = await markJobFailed(job.id, message, job.attemptCount);
      if (outcome === "DEAD") dead += 1;
      else failed += 1;
    }
  }

  return { processed: jobs.length, succeeded, failed, dead, stats };
}

export type DiscoveryType = "HISTORICAL_IMPORT" | "LIVE_DETECTION" | "RECONCILIATION_RECOVERY";

interface JobPayload {
  title?: string;
  latestSerial?: string;
  /** 카탈로그가 넣어둔 현행 MST(법령일련번호). eflaw 색인 누락 구제에 쓴다. */
  currentMst?: string;
  discoveryType?: DiscoveryType;
}

async function runJob(job: ClaimedJob): Promise<DetailSyncStats> {
  const payload = (job.payload ?? {}) as JobPayload;
  const discovery: DiscoveryType = payload.discoveryType ?? "LIVE_DETECTION";
  if (job.jobType !== "DETAIL") {
    throw new Error(`Unsupported jobType: ${job.jobType}`);
  }
  if (job.sourceType === "LAW") {
    return syncLawDocument(job.sourceId, payload.title, discovery, payload.currentMst);
  }
  if (job.sourceType === "ADMIN_RULE") {
    return syncAdminRuleDocument(job.sourceId, payload.latestSerial, payload.title, discovery);
  }
  throw new Error(`Unsupported sourceType: ${job.sourceType}`);
}

// ────────────────────────────────────────────────────────────────
// LAW: 이력 → 각 버전 상세 수집 · ContentUnit 승격 · Diff 생성
// ────────────────────────────────────────────────────────────────
export async function syncLawDocument(
  externalDocumentId: string,
  titleHint?: string,
  discoveryType: DiscoveryType = "LIVE_DETECTION",
  /** 카탈로그가 넣어둔 현행 MST. eflaw 색인에 없는 법령의 구제에 쓴다. */
  currentMst?: string,
): Promise<DetailSyncStats> {
  const legalSourceId = await getLegalSourceId("LAW");
  const knownDoc = await prisma.legalDocument.findUnique({
    where: { legalSourceId_externalDocumentId: { legalSourceId, externalDocumentId } },
    select: { currentTitle: true, id: true },
  });

  const searchName = knownDoc?.currentTitle ?? titleHint;
  if (!searchName) {
    throw new Error(
      `Cannot resolve title for LAW externalDocumentId=${externalDocumentId} (not in DB and no titleHint)`,
    );
  }

  let allHistory = await fetchLawHistoryByExternalId(searchName, externalDocumentId);
  if (allHistory.length === 0) {
    // eflaw(시행일 법령) 색인에 아예 없는 법령이 있다. 특검법·SOFA 협정
    // 시행법 등이 그렇다 — 목록이 0건이고 상세도 HTML 오류 페이지를 준다.
    // 그런데 target=law(현행 법령)에는 조문까지 멀쩡히 있다.
    // 이력은 못 받아도 현행 1판은 받아야 검색에서 사라지지 않는다.
    const fallback = await fetchCurrentOnlyHistory(externalDocumentId, currentMst);
    if (fallback) allHistory = [fallback];
  }
  if (allHistory.length === 0) {
    throw new Error(`No history entries for LAW externalDocumentId=${externalDocumentId}`);
  }

  const versions = allHistory.slice().sort((a, b) => a.시행일자.localeCompare(b.시행일자));
  const seed = versions[versions.length - 1];

  // 조문이 반드시 채워져 있어야 하는 판.
  // 수집기는 "최신" 을 시행일 기준으로 보지만 상세 화면(getLawFullText)은
  // 공포일 기준으로 보여줄 판을 고른다. 두 기준이 어긋나는 법령이 실재해서
  // (분할시행 법령 등) 화면이 고르는 판만 조문 0개로 남는 일이 있었다.
  // 그래서 양쪽 기준의 최신 판을 모두 채워 둔다. 공포일이 같은 줄이 여럿이면
  // (분할시행) 화면이 그중 어느 것을 고를지 정해져 있지 않으므로 전부 채운다.
  const maxPromulgation = versions.reduce((m, x) => ((x.공포일자 ?? "") > m ? x.공포일자 ?? "" : m), "");
  const mustHaveContent = new Set(
    versions.filter(
      (x) => x === seed || (maxPromulgation !== "" && (x.공포일자 ?? "") === maxPromulgation),
    ),
  );

  const doc = await prisma.legalDocument.upsert({
    where: { legalSourceId_externalDocumentId: { legalSourceId, externalDocumentId } },
    create: {
      legalSourceId,
      externalDocumentId,
      documentType: seed.법령구분명,
      currentTitle: seed.법령명한글.trim(),
      currentAgencyName: seed.소관부처명,
      currentAgencyCode: seed.소관부처코드,
      officialUrl: buildPublicOfficialUrl("LAW", externalDocumentId, seed.법령명한글),
    },
    update: {
      currentTitle: seed.법령명한글.trim(),
      currentAgencyName: seed.소관부처명,
      currentAgencyCode: seed.소관부처코드,
      officialUrl: buildPublicOfficialUrl("LAW", externalDocumentId, seed.법령명한글),
      lastCheckedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  let previousArticles: NormalizedArticle[] | null = null;
  let previousVersionId: string | null = null;
  let versionsCollected = 0;
  let changeEventsCreated = 0;
  let revisionSeq = 0;

  for (const v of versions) {
    // v13: 같은 공포건이 시행일별로 여러 줄 내려오므로(분할시행) 시행일까지
    // 봐야 같은 행인지 알 수 있다. 예전에는 (문서, 일련번호) 만 봐서 두 번째
    // 시행일 행을 "이미 있다" 로 판정하고 버렸다.
    // 시행일이 미정인 판은 API 가 9999-01-01 같은 자리표시 값을 준다.
    // 목록 응답에는 부칙이 없어 보정할 근거가 없으므로 미정(null)으로 둔다.
    const effectiveDate = resolveEffectiveDate(parseApiDate(v.시행일자), {
      promulgationDate: parseApiDate(v.공포일자),
    });
    const existing = await prisma.legalDocumentVersion.findFirst({
      where: {
        documentId: doc.id,
        externalVersionId: v.법령일련번호,
        effectiveDate,
      },
      include: { contentUnitVersions: true },
    });

    let versionRow;
    let articles: NormalizedArticle[];
    const isLatestVersion = v === versions[versions.length - 1];

    if (existing && existing.contentUnitVersions.length === 0 && mustHaveContent.has(v)) {
      // 조문이 0개인 채로 남아 있는 최신 판을 원문으로 다시 채운다.
      // 화면이 "조문 전문" 으로 보여주는 판이 비어 있으면 법령 본문이 통째로
      // 안 보인다 (상법·형사소송법 등 38건이 이 상태였다).
      //
      // 대상을 한정하는 이유: 오래된 판은 용량 정리로 일부러 비워 둔다.
      // 조건 없이 복구하면 정리한 9만여 판을 전부 다시 내려받게 된다.
      versionRow = existing;
      const detail = await fetchLawVersionDetail(v.법령일련번호, v.시행일자);
      const normalized = normalizeArticles(detail.법령?.조문?.조문단위);
      const storable = selectStorableArticles(normalized);
      if (storable.length > 0) {
        await writeContentUnits(doc.id, versionRow.id, storable);
        await prisma.legalDocumentVersion.update({
          where: { id: versionRow.id },
          data: { contentHash: computeDocumentHash(normalized) },
        });
      }
      articles = storable;
    } else if (existing) {
      versionRow = existing;
      // 기존 unitVersion에서 canonicalKey 조회
      const cuMap = await getContentUnitMap(doc.id, existing.contentUnitVersions.map((v) => v.contentUnitId));
      articles = existing.contentUnitVersions
        .sort((a, b) => a.unitOrder - b.unitOrder)
        .map((cv) => ({
          articleKey: cuMap.get(cv.contentUnitId) ?? cv.sourceKey,
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
    } else {
      const detail = await fetchLawVersionDetail(v.법령일련번호, v.시행일자);
      const articleUnits = detail.법령?.조문?.조문단위;
      const normalized = normalizeArticles(articleUnits);
      const storable = selectStorableArticles(normalized);
      const contentHash = computeDocumentHash(normalized);

      versionRow = await createVersionTolerantly({
        documentId: doc.id,
        externalVersionId: v.법령일련번호,
        revisionSequence: revisionSeq,
        revisionType: v.제개정구분명,
        promulgationNumber: v.공포번호 || null,
        promulgationDate: parseApiDate(v.공포일자),
        effectiveDate,
        titleSnapshot: v.법령명한글.trim(),
        agencyNameSnapshot: v.소관부처명,
        agencyCodeSnapshot: v.소관부처코드,
        contentHash,
      });

      // ContentUnit + ContentUnitVersion 생성
      await writeContentUnits(doc.id, versionRow.id, storable);
      articles = storable;
      versionsCollected += 1;
    }

    // 이벤트 생성
    const eventDiscovery: DiscoveryType =
      discoveryType === "HISTORICAL_IMPORT" || !isLatestVersion
        ? "HISTORICAL_IMPORT"
        : discoveryType;
    // 라운드 19-A: 이전 로직 (`notifyEligible = eventDiscovery === "LIVE_DETECTION"`) 은
    // HISTORICAL_IMPORT 로 들어온 이벤트를 무조건 notify=false 로 봉인해,
    // 시딩·백필로 들어온 미래 시행일 개정이 인박스에 뜨지 않는 문제를 만들었음
    // (심사 재현 케이스: 정보통신망법 D-40).
    // 감지 방식이 무엇이든 "시행일이 아직 남았고 게시된 개정"이면 사용자에게 알려야 함.
    const isFutureEffective =
      versionRow.effectiveDate instanceof Date && versionRow.effectiveDate.getTime() > Date.now();
    const notifyEligible = eventDiscovery === "LIVE_DETECTION" || isFutureEffective;

    const alreadyEvent = await prisma.legalChangeEvent.findUnique({
      where: { newVersionId: versionRow.id },
    });
    if (!alreadyEvent) {
      if (previousArticles && previousVersionId) {
        const { diffs, counts } = diffContentUnits(previousArticles, articles);
        await prisma.legalChangeEvent.create({
          data: {
            documentId: doc.id,
            previousVersionId,
            newVersionId: versionRow.id,
            eventType: mapEventType(v.제개정구분명),
            discoveryType: eventDiscovery,
            notificationEligible: notifyEligible,
            promulgationDate: versionRow.promulgationDate,
            effectiveDate: versionRow.effectiveDate,
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
        changeEventsCreated += 1;
      } else if (!existing) {
        await prisma.legalChangeEvent.create({
          data: {
            documentId: doc.id,
            previousVersionId: null,
            newVersionId: versionRow.id,
            eventType: "FIRST_ISSUE",
            discoveryType: eventDiscovery,
            notificationEligible: notifyEligible,
            promulgationDate: versionRow.promulgationDate,
            effectiveDate: versionRow.effectiveDate,
            totalDiffCount: articles.length,
            addedCount: articles.length,
            modifiedCount: 0,
            deletedCount: 0,
            movedCount: 0,
          },
        });
        changeEventsCreated += 1;
      }
    }

    previousArticles = articles;
    previousVersionId = versionRow.id;
    revisionSeq += 1;
  }

  // 목록의 기본 정렬(최근 개정순)이 쓰는 값. 여기서 안 올리면 새 개정이
  // 목록 맨 위로 올라오지 않는다.
  await refreshLastChangeAt(doc.id);

  return {
    documentId: doc.id,
    documentTitle: doc.currentTitle,
    versionsCollected,
    changeEventsCreated,
  };
}

// 조문 유닛 + 유닛 버전 기록. 새 판을 만들 때와, 비어 있는 최신 판을 뒤늦게
// 채울 때 양쪽에서 쓴다.
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

async function getContentUnitMap(documentId: string, contentUnitIds: string[]): Promise<Map<string, string>> {
  if (contentUnitIds.length === 0) return new Map();
  const rows = await prisma.legalContentUnit.findMany({
    where: { id: { in: contentUnitIds }, documentId },
    select: { id: true, canonicalKey: true },
  });
  return new Map(rows.map((r) => [r.id, r.canonicalKey]));
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

async function fetchLawHistoryByExternalId(
  name: string,
  externalDocumentId: string,
): Promise<LawListItem[]> {
  const all: LawListItem[] = [];
  let page = 1;
  while (page < 20) {
    const { items, totalCount } = await searchLaws({
      query: name,
      target: "eflaw",
      display: 100,
      page,
    });
    all.push(...items);
    if (all.length >= totalCount || items.length === 0) break;
    page += 1;
  }
  return all.filter((v) => v.법령ID === externalDocumentId);
}

/**
 * 버전 상세. eflaw 를 먼저 보고, 그 색인에 없는 법령이면 현행(law)으로 받는다.
 * eflaw 에 없는 법령은 상세도 JSON 이 아니라 HTML 오류 페이지를 돌려주는데,
 * 클라이언트가 그걸 "Non-JSON response" 로 던지므로 그때 갈아탄다.
 */
async function fetchLawVersionDetail(mst: string, efYd?: string) {
  try {
    return await fetchEflawDetail(mst, efYd);
  } catch (err) {
    const detail = await fetchLawDetail(mst);
    if (!detail?.법령) throw err; // 현행도 없으면 원래 오류를 그대로 올린다
    return detail;
  }
}

/**
 * eflaw 색인에 없는 법령의 구제 경로.
 *
 * 처음에는 target=law 목록을 검색해 MST 를 얻으려 했는데, 이 법령들은 제목이
 * 100자를 넘어 목록 API 가 query 로 0건을 돌려준다(target 을 바꿔도 같다).
 * 그래서 목록을 거치지 않고 카탈로그가 넣어둔 MST 로 상세를 바로 받는다.
 * lawService.do?target=law&MST=... 는 이 법령들도 조문까지 정상으로 준다.
 *
 * 이력은 못 받으므로 현행 1판만 만든다 — 개정 diff 는 없지만, 문서 자체가
 * 없어서 검색에 안 잡히는 것보다는 훨씬 낫다(실측 12건이 통째로 빠져 있었다).
 */
async function fetchCurrentOnlyHistory(
  externalDocumentId: string,
  currentMst?: string,
): Promise<LawListItem | null> {
  if (!currentMst) return null;
  const detail = await fetchLawDetail(currentMst);
  const info = detail?.법령?.기본정보;
  if (!info) return null;
  // 카탈로그가 넣어둔 MST 가 다른 문서를 가리키는 경우가 있다(실측 1건).
  // 엉뚱한 문서를 이 id 로 저장하면 안 된다.
  if (String(info.법령ID ?? "") !== externalDocumentId) return null;

  return {
    법령ID: externalDocumentId,
    법령일련번호: currentMst,
    법령명한글: String(info.법령명_한글 ?? "").trim(),
    공포일자: String(info.공포일자 ?? ""),
    공포번호: String(info.공포번호 ?? ""),
    시행일자: String(info.시행일자 ?? ""),
    // 이력이 없으니 제개정 구분을 알 수 없다. 있는 값을 그대로 쓴다.
    제개정구분명: String(info.제개정구분 ?? "현행"),
    소관부처명: info.소관부처?.content ?? "",
    소관부처코드: info.소관부처?.소관부처코드 ?? "",
    법령구분명: info.법종구분?.content ?? "",
  } as unknown as LawListItem;
}

function mapEventType(revisionType: string): string {
  if (revisionType.includes("제정")) return "FIRST_ISSUE";
  if (revisionType.includes("폐지")) return "REPEAL";
  return "REVISION";
}
