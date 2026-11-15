// 행정규칙 카탈로그 동기화
// - 받을 종류는 adminRuleKinds 정책이 정한다 (기본: 법원 계열 예규만 제외)
// - 신규/변경 감지 후 CollectorJob 큐잉 (sourceType='ADMIN_RULE')

import type { AdminRuleListItem } from "@/lib/admin-rule-api/types";
import { searchAdminRules } from "@/lib/admin-rule-api/client";
import { getLegalSourceId } from "@/lib/law-api/sources";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "./queue";
import { isCollectableAdminRuleKind } from "./adminRuleKinds";

export interface SyncAdminRuleCatalogOptions {
  ministryCodes?: string[];
  recentDays?: number;
  queries?: string[];
  pageSize?: number;
  maxPages?: number;
  /** 채택할 종류를 직접 지정할 때만. 비우면 제외 목록 정책을 따른다. */
  kinds?: string[];
}

export interface AdminRuleCatalogScanReport {
  scanned: number;
  filteredOut: number;
  newDocuments: number;
  changedDocuments: number;
  enqueued: number;
}

export async function syncAdminRuleCatalog(
  options: SyncAdminRuleCatalogOptions = {},
): Promise<AdminRuleCatalogScanReport> {
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 30;
  const kinds = options.kinds ? new Set(options.kinds) : null;

  const report: AdminRuleCatalogScanReport = {
    scanned: 0,
    filteredOut: 0,
    newDocuments: 0,
    changedDocuments: 0,
    enqueued: 0,
  };

  const dateRange = options.recentDays ? recentAncYdRange(options.recentDays) : undefined;
  const queries = options.queries && options.queries.length > 0 ? options.queries : [undefined];
  const orgs = options.ministryCodes && options.ministryCodes.length > 0 ? options.ministryCodes : [undefined];

  const seenIds = new Set<string>();

  for (const query of queries) {
    for (const org of orgs) {
      let page = 1;
      while (page <= maxPages) {
        const res = await searchAdminRules({
          query,
          org,
          display: pageSize,
          page,
          ancYd: dateRange,
        });
        const items = res.items;
        if (items.length === 0) break;

        for (const item of items) {
          report.scanned += 1;
          const accept = kinds
            ? kinds.has(item.행정규칙종류)
            : isCollectableAdminRuleKind(item.행정규칙종류);
          if (!accept) {
            report.filteredOut += 1;
            continue;
          }
          if (seenIds.has(item.행정규칙ID)) continue;
          seenIds.add(item.행정규칙ID);

          const outcome = await reconcile(item);
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

async function reconcile(item: AdminRuleListItem): Promise<"new" | "changed" | "unchanged"> {
  const legalSourceId = await getLegalSourceId("ADMIN_RULE");
  const existing = await prisma.legalDocument.findUnique({
    where: { legalSourceId_externalDocumentId: { legalSourceId, externalDocumentId: item.행정규칙ID } },
    include: {
      versions: {
        orderBy: { collectedAt: "desc" },
        take: 1,
        select: { externalVersionId: true },
      },
    },
  });

  if (!existing) {
    await enqueue(item);
    return "new";
  }

  const latestKnown = existing.versions[0]?.externalVersionId;
  if (latestKnown !== item.행정규칙일련번호) {
    await enqueue(item);
    return "changed";
  }

  await prisma.legalDocument.update({
    where: { id: existing.id },
    data: { lastCheckedAt: new Date(), lastSeenAt: new Date() },
  });
  return "unchanged";
}

async function enqueue(item: AdminRuleListItem): Promise<void> {
  await enqueueJob({
    jobType: "DETAIL",
    sourceType: "ADMIN_RULE",
    sourceId: item.행정규칙ID,
    payload: {
      latestSerial: item.행정규칙일련번호,
      title: item.행정규칙명,
      ruleKind: item.행정규칙종류,
      ministry: item.소관부처명,
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
