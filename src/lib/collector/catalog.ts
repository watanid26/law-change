// 법령(LAW) 카탈로그 동기화
// 법제처 목록 API를 훑어 신규/변경된 문서를 감지하고 CollectorJob 큐에 넣는다.
// 상세 조회·저장은 processCollectorJobs()가 담당 (2단계 분리).

import type { LawListItem } from "@/lib/law-api/types";
import { searchLaws } from "@/lib/law-api/client";
import { getLegalSourceId } from "@/lib/law-api/sources";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "./queue";

export interface SyncLawCatalogOptions {
  ministryCodes?: string[];
  recentDays?: number;
  queries?: string[];
  pageSize?: number;
  maxPages?: number;
}

export interface CatalogScanReport {
  scanned: number;
  newDocuments: number;
  changedDocuments: number;
  enqueued: number;
}

export async function syncLawCatalog(
  options: SyncLawCatalogOptions = {},
): Promise<CatalogScanReport> {
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 50;

  const report: CatalogScanReport = {
    scanned: 0,
    newDocuments: 0,
    changedDocuments: 0,
    enqueued: 0,
  };

  const dateRange = options.recentDays
    ? recentAncYdRange(options.recentDays)
    : undefined;

  const queries = options.queries && options.queries.length > 0 ? options.queries : [undefined];
  const orgs = options.ministryCodes && options.ministryCodes.length > 0
    ? options.ministryCodes
    : [undefined];

  const seenSourceIds = new Set<string>();

  for (const query of queries) {
    for (const org of orgs) {
      let page = 1;
      while (page <= maxPages) {
        const res = await searchLaws({
          query,
          org,
          target: "law",
          display: pageSize,
          page,
          ancYd: dateRange,
        });
        const items = res.items;
        if (items.length === 0) break;

        for (const item of items) {
          report.scanned += 1;
          if (seenSourceIds.has(item.법령ID)) continue;
          seenSourceIds.add(item.법령ID);

          const outcome = await reconcileDocument(item);
          if (outcome === "new") {
            report.newDocuments += 1;
            report.enqueued += 1;
          } else if (outcome === "changed") {
            report.changedDocuments += 1;
            report.enqueued += 1;
          }
        }

        if (items.length < pageSize) break;
        if (page * pageSize >= res.totalCount) break;
        page += 1;
      }
    }
  }

  return report;
}

async function reconcileDocument(
  item: LawListItem,
): Promise<"new" | "changed" | "unchanged"> {
  const legalSourceId = await getLegalSourceId("LAW");
  const existingDoc = await prisma.legalDocument.findUnique({
    where: { legalSourceId_externalDocumentId: { legalSourceId, externalDocumentId: item.법령ID } },
    include: {
      versions: {
        orderBy: { collectedAt: "desc" },
        take: 1,
        select: { externalVersionId: true },
      },
    },
  });

  if (!existingDoc) {
    await enqueueDetailJob(item);
    return "new";
  }

  const latestKnownMst = existingDoc.versions[0]?.externalVersionId;
  if (latestKnownMst !== item.법령일련번호) {
    await enqueueDetailJob(item);
    return "changed";
  }

  await prisma.legalDocument.update({
    where: { id: existingDoc.id },
    data: { lastCheckedAt: new Date(), lastSeenAt: new Date() },
  });
  return "unchanged";
}

async function enqueueDetailJob(item: LawListItem): Promise<void> {
  // partial unique index가 활성 중복을 DB 레벨에서 막음. enqueueJob이 unique violation을 조용히 처리.
  await enqueueJob({
    jobType: "DETAIL",
    sourceType: "LAW",
    sourceId: item.법령ID,
    payload: {
      currentMst: item.법령일련번호,
      title: item.법령명한글,
      documentType: item.법령구분명,
      ministry: item.소관부처명,
      ministryCode: item.소관부처코드,
    },
  });
}

function recentAncYdRange(days: number): string {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return `${toYYYYMMDD(start)}~${toYYYYMMDD(end)}`;
}

function toYYYYMMDD(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}${m}${day}`;
}
