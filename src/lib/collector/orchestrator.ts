// 배치 오케스트레이터 (Round 4.1)
// - runCatalogSync: 증분 catalog sync (LAW + ADMIN_RULE 독립 try/catch)
// - runJobBatch: stale 복구 + 상세 처리
// - runWeeklyIntegrityCheck: 최신 sourceVersionId API 재확인 + 실패 통계
// - runMonthlyReconciliation: cursor 기반 전체 sourceId 스캔 (부분 스캔 시 폐지 오탐 방지)
// - runCollectorMaintenance: stale 복구 + DONE 잡 정리
// - runFullCatalogBootstrap: cursor + concurrency lock + raw/matched 통계

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchLaws } from "@/lib/law-api/client";
import { searchAdminRules } from "@/lib/admin-rule-api/client";
import { syncLawCatalog, type CatalogScanReport } from "./catalog";
import { syncAdminRuleCatalog, type AdminRuleCatalogScanReport } from "./admin-rule-catalog";
import { processCollectorJobs } from "./detail";
import { CollectorLockLostError, cleanupCompletedJobs, enqueueJob, recoverStaleJobs } from "./queue";
import { isCollectableAdminRuleKind } from "./adminRuleKinds";

// ────────────────────────────────────────────────────────────────
// Catalog sync (증분) — LIVE_DETECTION discovery
// ────────────────────────────────────────────────────────────────
export interface CatalogSyncOptions {
  recentDays?: number;
  queries?: string[];
  ministryCodes?: string[];
  includeLaw?: boolean;
  includeAdminRule?: boolean;
  adminRuleKinds?: string[];
}

export interface CatalogSyncReport {
  runId: string;
  law: { status: "success" | "failed" | "skipped"; report?: CatalogScanReport; error?: string };
  adminRule: { status: "success" | "failed" | "skipped"; report?: AdminRuleCatalogScanReport; error?: string };
  status: "success" | "partial_success" | "failed";
  elapsedMs: number;
}

export async function runCatalogSync(options: CatalogSyncOptions = {}): Promise<CatalogSyncReport> {
  const start = Date.now();
  const run = await prisma.collectorRun.create({
    data: { jobType: "CATALOG_LAW", status: "running" },
  });

  let law: CatalogSyncReport["law"] = { status: "skipped" };
  let adminRule: CatalogSyncReport["adminRule"] = { status: "skipped" };

  if (options.includeLaw !== false) {
    try {
      const report = await syncLawCatalog({
        recentDays: options.recentDays,
        queries: options.queries,
        ministryCodes: options.ministryCodes,
      });
      law = { status: "success", report };
    } catch (err) {
      law = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (options.includeAdminRule !== false) {
    try {
      const report = await syncAdminRuleCatalog({
        recentDays: options.recentDays,
        queries: options.queries,
        ministryCodes: options.ministryCodes,
        kinds: options.adminRuleKinds,
      });
      adminRule = { status: "success", report };
    } catch (err) {
      adminRule = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const status: CatalogSyncReport["status"] =
    law.status === "failed" && adminRule.status === "failed"
      ? "failed"
      : law.status === "failed" || adminRule.status === "failed"
        ? "partial_success"
        : "success";

  const scanned = (law.report?.scanned ?? 0) + (adminRule.report?.scanned ?? 0);
  const newDocs = (law.report?.newDocuments ?? 0) + (adminRule.report?.newDocuments ?? 0);
  const changed = (law.report?.changedDocuments ?? 0) + (adminRule.report?.changedDocuments ?? 0);

  await prisma.collectorRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      scannedCount: scanned,
      newCount: newDocs,
      changedCount: changed,
      errorMessage: [law.error, adminRule.error].filter(Boolean).join(" | ") || null,
      metadata: { law, adminRule, options } as unknown as Prisma.InputJsonValue,
    },
  });

  return { runId: run.id, law, adminRule, status, elapsedMs: Date.now() - start };
}

// ────────────────────────────────────────────────────────────────
// Job batch
// ────────────────────────────────────────────────────────────────
export interface JobBatchOptions {
  batchSize?: number;
  workerLabel?: string;
  staleMinutes?: number;
}

export interface JobBatchReport {
  runId: string;
  processed: number;
  succeeded: number;
  failed: number;
  dead: number;
  staleRecovered: number;
  staleDeadened: number;
  status: "success" | "partial_success" | "failed";
  elapsedMs: number;
}

export async function runJobBatch(options: JobBatchOptions = {}): Promise<JobBatchReport> {
  const start = Date.now();
  const run = await prisma.collectorRun.create({
    data: { jobType: "DETAIL_LAW", status: "running" },
  });

  let staleRecovered = 0;
  let staleDeadened = 0;
  let result = { processed: 0, succeeded: 0, failed: 0, dead: 0, stats: [] as unknown[] };
  let status: JobBatchReport["status"] = "success";
  let errorMessage: string | null = null;

  try {
    const stale = await recoverStaleJobs(
      options.staleMinutes ?? Number(process.env.COLLECTOR_STALE_MINUTES ?? "15"),
    );
    staleRecovered = stale.recovered;
    staleDeadened = stale.deadened;

    result = await processCollectorJobs(
      options.batchSize ?? Number(process.env.COLLECTOR_BATCH_SIZE ?? "15"),
      options.workerLabel,
    );

    if (result.dead > 0 || result.failed > 0) {
      status = result.succeeded > 0 ? "partial_success" : "failed";
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    status = result.succeeded > 0 ? "partial_success" : "failed";
  }

  await prisma.collectorRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      successCount: result.succeeded,
      failCount: result.failed + result.dead,
      staleRecoveredCount: staleRecovered + staleDeadened,
      errorMessage,
    },
  });

  return {
    runId: run.id,
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    dead: result.dead,
    staleRecovered,
    staleDeadened,
    status,
    elapsedMs: Date.now() - start,
  };
}

// ────────────────────────────────────────────────────────────────
// Maintenance
// ────────────────────────────────────────────────────────────────
export async function runCollectorMaintenance(): Promise<{
  runId: string;
  staleRecovered: number;
  staleDeadened: number;
  cleanedUp: number;
  elapsedMs: number;
}> {
  const start = Date.now();
  const run = await prisma.collectorRun.create({
    data: { jobType: "CLEANUP", status: "running" },
  });

  const stale = await recoverStaleJobs(
    Number(process.env.COLLECTOR_STALE_MINUTES ?? "15"),
  );
  const cleanedUp = await cleanupCompletedJobs(30);

  await prisma.collectorRun.update({
    where: { id: run.id },
    data: {
      status: "success",
      finishedAt: new Date(),
      staleRecoveredCount: stale.recovered + stale.deadened,
      metadata: { cleanedUp, stale } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    runId: run.id,
    staleRecovered: stale.recovered,
    staleDeadened: stale.deadened,
    cleanedUp,
    elapsedMs: Date.now() - start,
  };
}

// ────────────────────────────────────────────────────────────────
// Weekly integrity check — 실패 통계 분리 + 상태 열거형
// - sourceId 직접 조회는 API가 지원하지 않아 이름 검색 후 매칭이 우선순위 fallback
// - 개별 실패는 CollectorRun.metadata.errorSamples 에 최대 10건 기록
// ────────────────────────────────────────────────────────────────
export interface WeeklyIntegrityReport {
  runId: string;
  selected: number;
  checked: number;
  verified: number;
  outdated: number;
  notFound: number;
  searchFailed: number;
  enqueued: number;
  failed: number;
  status: "success" | "partial_success" | "failed";
  reason?: string;
  elapsedMs: number;
  errorSamples: Array<{ sourceType: string; sourceId: string; title: string; error: string }>;
}

export async function runWeeklyIntegrityCheck(options: {
  sampleLimit?: number;
} = {}): Promise<WeeklyIntegrityReport> {
  const start = Date.now();
  const run = await prisma.collectorRun.create({
    data: { jobType: "INTEGRITY", status: "running" },
  });

  const limit = options.sampleLimit ?? 200;
  const docs = await prisma.legalDocument.findMany({
    orderBy: { lastCheckedAt: "asc" },
    take: limit,
    include: {
      legalSource: { select: { sourceType: true } },
      versions: {
        orderBy: { collectedAt: "desc" },
        take: 1,
        select: { externalVersionId: true },
      },
    },
  });

  let checked = 0;
  let verified = 0;
  let outdated = 0;
  let notFound = 0;
  let searchFailed = 0;
  let enqueued = 0;
  let failed = 0;
  const errorSamples: WeeklyIntegrityReport["errorSamples"] = [];

  for (const doc of docs) {
    checked += 1;
    const knownMst = doc.versions[0]?.externalVersionId;
    const sourceType = doc.legalSource.sourceType as "LAW" | "ADMIN_RULE";
    const externalDocumentId = doc.externalDocumentId;
    const title = doc.currentTitle;
    try {
      let latestMst: string | undefined;
      let latestPayload: unknown = {};
      let searchResultCount = 0;

      if (sourceType === "LAW") {
        const { items } = await searchLaws({ query: title, target: "eflaw", display: 20 });
        searchResultCount = items.length;
        const match = items
          .filter((i) => i.법령ID === externalDocumentId)
          .sort((a, b) => b.시행일자.localeCompare(a.시행일자))[0];
        latestMst = match?.법령일련번호;
        latestPayload = { title, currentMst: latestMst };
      } else if (sourceType === "ADMIN_RULE") {
        const { items } = await searchAdminRules({ query: title, display: 20 });
        searchResultCount = items.length;
        const match = items.find((i) => String(i.행정규칙ID) === externalDocumentId);
        latestMst = match?.행정규칙일련번호;
        latestPayload = { title, latestSerial: latestMst };
      }

      if (searchResultCount === 0) {
        searchFailed += 1;
      } else if (!latestMst) {
        notFound += 1;
      } else if (latestMst !== knownMst) {
        outdated += 1;
        const outcome = await enqueueJob({
          jobType: "DETAIL",
          sourceType,
          sourceId: externalDocumentId,
          payload: latestPayload,
        });
        if (outcome === "enqueued") enqueued += 1;
      } else {
        verified += 1;
      }
      await prisma.legalDocument.update({
        where: { id: doc.id },
        data: { lastCheckedAt: new Date(), lastSeenAt: new Date() },
      });
    } catch (err) {
      failed += 1;
      if (errorSamples.length < 10) {
        errorSamples.push({
          sourceType,
          sourceId: externalDocumentId,
          title,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 상태 결정 규칙:
  // - selected=0 → success (검사 대상 자체가 없음, 이상 아님)
  // - verified+outdated>0 && failed=0 && searchFailed=0 → success
  // - verified+outdated>0 && (failed OR searchFailed) > 0 → partial_success
  // - verified+outdated=0 && selected>0 → partial_success + reason=NO_DOCUMENT_VERIFIED
  //   (진짜 문제일 수 있음 — 모든 검색이 실패했거나 매칭 실패)
  const meaningful = verified + outdated;
  let status: WeeklyIntegrityReport["status"];
  let reason: string | undefined;
  if (docs.length === 0) {
    status = "success";
  } else if (meaningful === 0) {
    status = "partial_success";
    reason = "NO_DOCUMENT_VERIFIED";
  } else if (failed === 0 && searchFailed === 0) {
    status = "success";
  } else {
    status = "partial_success";
    reason = failed > 0 ? "SOME_API_ERRORS" : "SOME_SEARCH_FAILURES";
  }

  await prisma.collectorRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      scannedCount: checked,
      changedCount: outdated,
      successCount: meaningful, // 실제로 검증되거나 개정 발견된 것만 성공
      failCount: failed + searchFailed, // 명확한 실패 (개별 예외 + 검색 결과 없음)
      metadata: {
        selected: docs.length,
        checked,
        verified,
        outdated,
        notFound,
        searchFailed,
        enqueued,
        failed,
        reason,
        errorSamples,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    runId: run.id,
    selected: docs.length,
    checked,
    verified,
    outdated,
    notFound,
    searchFailed,
    enqueued,
    failed,
    status,
    reason,
    elapsedMs: Date.now() - start,
    errorSamples,
  };
}

// ────────────────────────────────────────────────────────────────
// Monthly reconciliation — cursor 기반 전체 스캔
// 세션 단위로 페이지를 나눠 실행, 세션 완료 시에만 폐지 후보 계산.
// 부분 스캔 상태에서는 dbOnly 계산 금지 (오탐 방지).
// ────────────────────────────────────────────────────────────────
export interface MonthlyReconReport {
  runId: string;
  sessionId: string;
  sourceType: string;
  cursorPage: number;
  totalPages: number | null;
  scannedCount: number;
  sessionStatus: "RUNNING" | "COMPLETED" | "FAILED";
  scanComplete: boolean;
  comparisonSkipped: boolean;
  reason?: string;
  apiOnly: number | null;
  dbOnly: number | null;
  enqueued: number;
  suspectedRepealsSample: string[];
  elapsedMs: number;
}

const RECON_PAGE_SIZE = 100;

export async function runMonthlyReconciliation(options: {
  sourceType: "LAW" | "ADMIN_RULE";
  maxPagesPerRun?: number; // 한 실행에서 최대 몇 페이지 (Vercel 5분 상한)
  reset?: boolean;
} = { sourceType: "LAW" }): Promise<MonthlyReconReport> {
  const start = Date.now();
  const run = await prisma.collectorRun.create({
    data: { jobType: "INTEGRITY", status: "running" },
  });
  const workerId = `recon-${process.pid}-${randomUUID().slice(0, 8)}`;
  const maxPagesPerRun = options.maxPagesPerRun ?? 20;

  // stale threshold: env로 튜닝 가능 (default 5분)
  const STALE_MS = Number(process.env.COLLECTOR_PROGRESS_LOCK_STALE_MS ?? "300000");

  // 진행 중인 RUNNING 세션이 있으면 이어감, 없으면 새 세션 시작
  let session = await prisma.reconciliationProgress.findFirst({
    where: { sourceType: options.sourceType, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });

  if (options.reset && session) {
    await prisma.reconciliationProgress.update({
      where: { id: session.id },
      data: { status: "FAILED", finishedAt: new Date(), lastError: "reset by user" },
    });
    session = null;
  }

  if (!session) {
    // 새 세션 create — v8 partial unique (source_type WHERE status='RUNNING')로 race 원천 차단
    try {
      session = await prisma.reconciliationProgress.create({
        data: {
          sourceType: options.sourceType,
          sessionId: `sess-${Date.now()}-${randomUUID().slice(0, 6)}`,
          cursorPage: 1,
          status: "RUNNING",
          lockedAt: new Date(),
          lockedBy: workerId,
          heartbeatAt: new Date(),
        },
      });
    } catch (err) {
      // P2002: 다른 worker가 방금 RUNNING 세션 생성
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        session = await prisma.reconciliationProgress.findFirst({
          where: { sourceType: options.sourceType, status: "RUNNING" },
          orderBy: { startedAt: "desc" },
        });
        if (!session) throw err; // 정말 이상한 상황
      } else {
        throw err;
      }
    }
  }
  if (session.lockedBy !== workerId) {
    // 원자적 lock 획득: 조건부 UPDATE
    const staleThreshold = new Date(Date.now() - STALE_MS);
    const lockRes = await prisma.reconciliationProgress.updateMany({
      where: {
        id: session.id,
        OR: [
          { lockedBy: null },
          { lockedBy: workerId },
          { heartbeatAt: { lt: staleThreshold } },
          { heartbeatAt: null },
        ],
      },
      data: { lockedAt: new Date(), lockedBy: workerId, heartbeatAt: new Date() },
    });
    if (lockRes.count === 0) {
      await prisma.collectorRun.update({
        where: { id: run.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          errorMessage: `Another recon session in progress (locked by ${session.lockedBy})`,
        },
      });
      return {
        runId: run.id,
        sessionId: session.sessionId,
        sourceType: options.sourceType,
        cursorPage: session.cursorPage,
        totalPages: session.totalCount ? Math.ceil(session.totalCount / RECON_PAGE_SIZE) : null,
        scannedCount: session.scannedCount,
        sessionStatus: "RUNNING",
        scanComplete: false,
        comparisonSkipped: true,
        reason: "CONCURRENT_LOCK",
        apiOnly: null,
        dbOnly: null,
        enqueued: 0,
        suspectedRepealsSample: [],
        elapsedMs: Date.now() - start,
      };
    }
    session = (await prisma.reconciliationProgress.findUnique({ where: { id: session.id } }))!;
  }

  let currentPage = session.cursorPage;
  let sessionScanned = session.scannedCount; // 세션 전체 누적
  let runScanned = 0;                         // 이번 실행에서만 훑은 페이지 원본 개수
  let totalCount = session.totalCount;
  let error: string | null = null;
  let completed = false;

  try {
    for (let i = 0; i < maxPagesPerRun; i += 1) {
      let items: Array<{ id: string }> = [];
      if (options.sourceType === "LAW") {
        const res = await searchLaws({ target: "law", display: RECON_PAGE_SIZE, page: currentPage });
        items = res.items.map((r) => ({ id: r.법령ID }));
        totalCount = res.totalCount;
      } else {
        const res = await searchAdminRules({ display: RECON_PAGE_SIZE, page: currentPage });
        items = res.items.map((r) => ({ id: r.행정규칙ID }));
        totalCount = res.totalCount;
      }

      // 스냅샷 저장: skipDuplicates로 P2002는 조용히 무시, 다른 DB 오류는 throw
      if (items.length > 0) {
        await prisma.reconciliationSourceSnapshot.createMany({
          data: items.map((it) => ({ reconciliationId: session!.id, sourceId: it.id })),
          skipDuplicates: true,
        });
      }
      const pageCount = items.length;
      sessionScanned += pageCount;
      runScanned += pageCount;
      currentPage += 1;

      // 진행 커밋 — 반드시 lockedBy=me 검증. 뺏겼으면 LOCK_LOST throw.
      const commit = await prisma.reconciliationProgress.updateMany({
        where: { id: session.id, lockedBy: workerId },
        data: {
          cursorPage: currentPage,
          totalCount,
          scannedCount: sessionScanned,
          heartbeatAt: new Date(),
        },
      });
      if (commit.count === 0) {
        throw new CollectorLockLostError(`RECON_LOCK_LOST session=${session.sessionId}`);
      }

      if (pageCount === 0) {
        completed = true;
        break;
      }
      if (currentPage > Math.ceil(totalCount / RECON_PAGE_SIZE)) {
        completed = true;
        break;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // 세션 완료 시에만 폐지 후보 계산
  let apiOnly: number | null = null;
  let dbOnly: number | null = null;
  let enqueuedCount = 0;
  let suspectedRepealsSample: string[] = [];
  let comparisonSkipped = false;
  let reason: string | undefined;

  if (completed && !error) {
    // 마이그레이션 v7 seed된 LegalSource ID로 매핑
    const legalSourceId = options.sourceType === "LAW" ? "src_kr_moleg_law" : "src_kr_moleg_rule";
    const [dbDocs, snapshots] = await Promise.all([
      prisma.legalDocument.findMany({
        where: { legalSourceId },
        select: { externalDocumentId: true },
      }),
      prisma.reconciliationSourceSnapshot.findMany({
        where: { reconciliationId: session.id },
        select: { sourceId: true },
      }),
    ]);
    const dbIds = new Set(dbDocs.map((d) => d.externalDocumentId));
    const apiIds = new Set(snapshots.map((s) => s.sourceId));

    const apiOnlyIds: string[] = [];
    apiIds.forEach((id) => {
      if (!dbIds.has(id)) apiOnlyIds.push(id);
    });
    const dbOnlyIds: string[] = [];
    dbIds.forEach((id) => {
      if (!apiIds.has(id)) dbOnlyIds.push(id);
    });

    apiOnly = apiOnlyIds.length;
    dbOnly = dbOnlyIds.length;
    suspectedRepealsSample = dbOnlyIds.slice(0, 20);

    // apiOnly 는 catalog 큐잉 (안전 상한 200) — RECONCILIATION_RECOVERY 로 표시
    for (const id of apiOnlyIds.slice(0, 200)) {
      const outcome = await enqueueJob({
        jobType: "DETAIL",
        sourceType: options.sourceType,
        sourceId: id,
        payload: { discoveryType: "RECONCILIATION_RECOVERY" },
      });
      if (outcome === "enqueued") enqueuedCount += 1;
    }

    // 세션 완료 표시 — lock 해제는 본인일 때만
    await prisma.reconciliationProgress.updateMany({
      where: { id: session.id, lockedBy: workerId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
  } else {
    comparisonSkipped = true;
    reason = error ? "SCAN_FAILED" : "PARTIAL_SCAN";
    // lock 해제는 본인일 때만
    await prisma.reconciliationProgress.updateMany({
      where: { id: session.id, lockedBy: workerId },
      data: {
        status: error ? "FAILED" : "RUNNING",
        finishedAt: error ? new Date() : null,
        lastError: error,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  const isLockLost = error?.includes("RECON_LOCK_LOST") ?? false;
  const sessionStatus: "RUNNING" | "COMPLETED" | "FAILED" = error && !isLockLost
    ? "FAILED"
    : completed
      ? "COMPLETED"
      : "RUNNING";

  // CollectorRun 상태:
  // - error 없음 → success
  // - error + runScanned > 0 → partial_success (이번 실행에서 뭐라도 훑음)
  // - error + runScanned = 0 (첫 페이지도 실패) → failed
  // - LOCK_LOST → metadata에 별도 기록
  const runStatus = !error
    ? "success"
    : runScanned > 0
      ? "partial_success"
      : "failed";

  await prisma.collectorRun.update({
    where: { id: run.id },
    data: {
      status: runStatus,
      finishedAt: new Date(),
      scannedCount: runScanned, // 이번 호출에서 처리한 원본 개수
      newCount: apiOnly ?? 0,
      errorMessage: error,
      metadata: {
        sourceType: options.sourceType,
        sessionId: session.sessionId,
        cursorPage: currentPage,
        totalCount,
        runScanned,        // 이번 실행
        sessionScanned,    // 세션 전체 누적
        scanComplete: completed,
        comparisonSkipped,
        reason,
        apiOnly,
        dbOnly,
        enqueued: enqueuedCount,
        suspectedRepealsSample,
        lockLost: isLockLost,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    runId: run.id,
    sessionId: session.sessionId,
    sourceType: options.sourceType,
    cursorPage: currentPage,
    totalPages: totalCount ? Math.ceil(totalCount / RECON_PAGE_SIZE) : null,
    scannedCount: sessionScanned, // 세션 전체 누적 (report는 세션 상태 반영)
    sessionStatus,
    scanComplete: completed,
    comparisonSkipped,
    reason: isLockLost ? "LOCK_LOST" : reason,
    apiOnly,
    dbOnly,
    enqueued: enqueuedCount,
    suspectedRepealsSample,
    elapsedMs: Date.now() - start,
  };
}

// ────────────────────────────────────────────────────────────────
// Bootstrap — cursor + concurrency lock + raw/matched 통계 + HISTORICAL_IMPORT
// ────────────────────────────────────────────────────────────────
export interface BootstrapOptions {
  sourceType: "LAW" | "ADMIN_RULE";
  scope?: string;
  maxPagesPerRun?: number;
  reset?: boolean;
}

export interface BootstrapReport {
  runId: string;
  sourceType: string;
  scope: string;
  startedFromPage: number;
  endedAtPage: number;
  pagesProcessed: number;
  rawScanned: number;
  matched: number;
  enqueued: number;         // 실제 새로 큐잉된 것 (P2002 제외)
  alreadyActive: number;    // 이미 활성 잡 존재로 스킵
  status: "RUNNING" | "COMPLETED" | "FAILED" | "LOCKED" | "ALREADY_COMPLETED";
  reason?: string;
  elapsedMs: number;
}

const BOOTSTRAP_PAGE_SIZE = 100;

export async function runFullCatalogBootstrap(options: BootstrapOptions): Promise<BootstrapReport> {
  const start = Date.now();
  const scope = options.scope ?? "all";
  const maxPages = options.maxPagesPerRun ?? 20;
  const workerId = `boot-${process.pid}-${randomUUID().slice(0, 8)}`;
  // stale threshold: env로 튜닝 가능 (default 5분)
  const STALE_MS = Number(process.env.COLLECTOR_PROGRESS_LOCK_STALE_MS ?? "300000");

  const collectorRun = await prisma.collectorRun.create({
    data: { jobType: "BOOTSTRAP", status: "running" },
  });

  // 1) 기존 progress 조회 (없으면 create)
  let progress = await prisma.bootstrapProgress.findUnique({
    where: { sourceType_scope: { sourceType: options.sourceType, scope } },
  });
  if (!progress) {
    // create만은 unique 제약이 race를 방지. 두 요청이 동시에 create해도 하나만 성공.
    try {
      progress = await prisma.bootstrapProgress.create({
        data: {
          sourceType: options.sourceType,
          scope,
          cursorPage: 1,
          status: "RUNNING",
        },
      });
    } catch {
      // 다른 요청이 이미 만듦 → 다시 fetch
      progress = await prisma.bootstrapProgress.findUnique({
        where: { sourceType_scope: { sourceType: options.sourceType, scope } },
      });
      if (!progress) throw new Error("BootstrapProgress race: cannot resolve");
    }
  }

  // 2) COMPLETED 상태 & reset=false → 조기 반환 (재실행으로 카운트 오염 방지)
  if (progress.status === "COMPLETED" && !options.reset) {
    await prisma.collectorRun.update({
      where: { id: collectorRun.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        errorMessage: "ALREADY_COMPLETED (reset=false)",
      },
    });
    return {
      runId: collectorRun.id,
      sourceType: options.sourceType,
      scope,
      startedFromPage: progress.cursorPage,
      endedAtPage: progress.cursorPage,
      pagesProcessed: 0,
      rawScanned: 0,
      matched: 0,
      enqueued: 0,
      alreadyActive: 0,
      status: "ALREADY_COMPLETED",
      reason: "Use reset=true to re-run from page 1",
      elapsedMs: Date.now() - start,
    };
  }

  // 3) 원자적 lock 획득 — 조건부 UPDATE + count 확인
  //    조건: lockedBy IS NULL || lockedBy = me || heartbeat_at < now - 5m
  //    성공한 update만 lock 획득. 두 워커 동시 실행해도 하나만 성공.
  const staleThreshold = new Date(Date.now() - STALE_MS);
  const now = new Date();
  const resetPayload = options.reset
    ? {
        cursorPage: 1,
        totalCount: 0,
        rawScannedCount: 0,
        matchedCount: 0,
        enqueuedCount: 0,
        alreadyActiveCount: 0,
        startedAt: now,
        finishedAt: null,
      }
    : {};

  const lockResult = await prisma.bootstrapProgress.updateMany({
    where: {
      id: progress.id,
      OR: [
        { lockedBy: null },
        { lockedBy: workerId },
        { heartbeatAt: { lt: staleThreshold } },
        { heartbeatAt: null },
      ],
    },
    data: {
      ...resetPayload,
      status: "RUNNING",
      lastError: null,
      lockedAt: now,
      lockedBy: workerId,
      heartbeatAt: now,
    },
  });

  if (lockResult.count === 0) {
    // 다른 워커가 lock 보유 중
    const current = await prisma.bootstrapProgress.findUnique({
      where: { id: progress.id },
      select: { lockedBy: true, cursorPage: true },
    });
    await prisma.collectorRun.update({
      where: { id: collectorRun.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        errorMessage: `Bootstrap already running (locked by ${current?.lockedBy ?? "?"})`,
      },
    });
    return {
      runId: collectorRun.id,
      sourceType: options.sourceType,
      scope,
      startedFromPage: current?.cursorPage ?? progress.cursorPage,
      endedAtPage: current?.cursorPage ?? progress.cursorPage,
      pagesProcessed: 0,
      rawScanned: 0,
      matched: 0,
      enqueued: 0,
      alreadyActive: 0,
      status: "LOCKED",
      reason: "CONCURRENT_LOCK",
      elapsedMs: Date.now() - start,
    };
  }

  // 4) lock 획득 성공 → 최신 progress 재조회
  progress = (await prisma.bootstrapProgress.findUnique({
    where: { id: progress.id },
  }))!;

  const startPage = progress.cursorPage;

  let currentPage = startPage;
  let rawScanned = 0;
  let matched = 0;
  let enqueued = 0;
  let alreadyActive = 0;
  let totalCount = progress.totalCount;
  let completed = false;
  let error: string | null = null;

  try {
    for (let i = 0; i < maxPages; i += 1) {
      // 원본 API 응답
      let rawItems: Array<{ raw: unknown; sourceId: string; matched: boolean; payload: unknown }> = [];

      if (options.sourceType === "LAW") {
        const { items, totalCount: tc } = await searchLaws({
          target: "law",
          display: BOOTSTRAP_PAGE_SIZE,
          page: currentPage,
        });
        totalCount = tc;
        rawItems = items.map((item) => ({
          raw: item,
          sourceId: item.법령ID,
          matched: true, // LAW는 모두 매칭
          payload: {
            currentMst: item.법령일련번호,
            title: item.법령명한글,
            documentType: item.법령구분명,
            ministry: item.소관부처명,
            ministryCode: item.소관부처코드,
            discoveryType: "HISTORICAL_IMPORT",
          },
        }));
      } else {
        const { items, totalCount: tc } = await searchAdminRules({
          display: BOOTSTRAP_PAGE_SIZE,
          page: currentPage,
        });
        totalCount = tc;
        rawItems = items.map((item) => ({
          raw: item,
          sourceId: item.행정규칙ID,
          matched: isCollectableAdminRuleKind(item.행정규칙종류),
          payload: {
            latestSerial: item.행정규칙일련번호,
            title: item.행정규칙명,
            ruleKind: item.행정규칙종류,
            ministry: item.소관부처명,
            discoveryType: "HISTORICAL_IMPORT",
          },
        }));
      }

      // 원본 API 응답 길이 (필터 전) — 종료 판정에 이걸 사용
      const rawPageCount = rawItems.length;
      rawScanned += rawPageCount;

      // 페이지별 카운트
      let pageMatched = 0;
      let pageEnqueued = 0;
      let pageAlreadyActive = 0;

      for (const it of rawItems) {
        if (!it.matched) continue;
        pageMatched += 1;
        const outcome = await enqueueJob({
          jobType: "DETAIL",
          sourceType: options.sourceType,
          sourceId: it.sourceId,
          payload: it.payload,
        });
        if (outcome === "enqueued") pageEnqueued += 1;
        else if (outcome === "already_active") pageAlreadyActive += 1;
      }
      matched += pageMatched;
      enqueued += pageEnqueued;
      alreadyActive += pageAlreadyActive;

      currentPage += 1;

      // 진행 커밋 + heartbeat + 정확한 카운트 — 반드시 lockedBy=me 검증
      // 다른 워커가 stale 판정으로 lock을 뺏은 경우 우리는 즉시 중단해야 함.
      const commit = await prisma.bootstrapProgress.updateMany({
        where: { id: progress.id, lockedBy: workerId },
        data: {
          cursorPage: currentPage,
          totalCount,
          rawScannedCount: { increment: rawPageCount },
          matchedCount: { increment: pageMatched },
          enqueuedCount: { increment: pageEnqueued },
          alreadyActiveCount: { increment: pageAlreadyActive },
          heartbeatAt: new Date(),
        },
      });
      if (commit.count === 0) {
        throw new CollectorLockLostError(`BOOTSTRAP_LOCK_LOST scope=${scope}`);
      }

      // 종료 판정: 원본 API 응답 기준 (필터 결과 아님!)
      if (rawPageCount === 0) {
        completed = true;
        break;
      }
      if (currentPage > Math.ceil(totalCount / BOOTSTRAP_PAGE_SIZE)) {
        completed = true;
        break;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const isLockLost = error?.includes("BOOTSTRAP_LOCK_LOST") ?? false;
  const finalStatus: "RUNNING" | "COMPLETED" | "FAILED" = error
    ? "FAILED"
    : completed
      ? "COMPLETED"
      : "RUNNING";

  // lock 해제는 본인 workerId일 때만 (LOCK_LOST 상황에서는 카운트 = 0)
  if (!isLockLost) {
    await prisma.bootstrapProgress.updateMany({
      where: { id: progress.id, lockedBy: workerId },
      data: {
        status: finalStatus,
        finishedAt: completed || error ? new Date() : null,
        lastError: error,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  // CollectorRun 상태:
  // - error 없음 → success
  // - error + rawScanned > 0 → partial_success
  // - error + rawScanned = 0 (첫 페이지도 실패) → failed
  // - LOCK_LOST → 별도 error code로 metadata에 기록
  const runStatus = !error
    ? "success"
    : rawScanned > 0
      ? "partial_success"
      : "failed";

  await prisma.collectorRun.update({
    where: { id: collectorRun.id },
    data: {
      status: runStatus,
      finishedAt: new Date(),
      scannedCount: rawScanned,
      newCount: enqueued,
      errorMessage: error,
      metadata: {
        sourceType: options.sourceType,
        scope,
        startedFromPage: startPage,
        endedAtPage: currentPage - 1,
        rawScanned, // 이번 실행에서 훑은 페이지 원본 (== run stats)
        matched,
        enqueued,
        alreadyActive,
        completed,
        lockLost: isLockLost,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    runId: collectorRun.id,
    sourceType: options.sourceType,
    scope,
    startedFromPage: startPage,
    endedAtPage: currentPage - 1,
    pagesProcessed: currentPage - startPage,
    rawScanned,
    matched,
    enqueued,
    alreadyActive,
    status: isLockLost ? "LOCKED" : finalStatus,
    reason: isLockLost ? "LOCK_LOST" : undefined,
    elapsedMs: Date.now() - start,
  };
}

// ────────────────────────────────────────────────────────────────
// 초기 시드 (이름 리스트 기반)
// ────────────────────────────────────────────────────────────────
export async function runInitialSeed(names: string[]): Promise<{
  runId: string;
  catalog: CatalogScanReport;
  detail: { processed: number; succeeded: number; failed: number };
}> {
  const run = await prisma.collectorRun.create({
    data: { jobType: "CATALOG_LAW", status: "running" },
  });

  const catalog = await syncLawCatalog({ queries: names });

  const detail = { processed: 0, succeeded: 0, failed: 0 };
  while (true) {
    const round = await processCollectorJobs(20, "seed");
    detail.processed += round.processed;
    detail.succeeded += round.succeeded;
    detail.failed += round.failed + round.dead;
    if (round.processed === 0) break;
  }

  await prisma.collectorRun.update({
    where: { id: run.id },
    data: {
      status: detail.failed === 0 ? "success" : "partial_success",
      finishedAt: new Date(),
      scannedCount: catalog.scanned,
      newCount: catalog.newDocuments,
      changedCount: catalog.changedDocuments,
      successCount: detail.succeeded,
      failCount: detail.failed,
    },
  });

  return { runId: run.id, catalog, detail };
}

export async function runIntegrityCheck(): Promise<{
  runId: string;
  staleRecovered: number;
  cleanedUp: number;
  elapsedMs: number;
}> {
  const maint = await runCollectorMaintenance();
  return {
    runId: maint.runId,
    staleRecovered: maint.staleRecovered + maint.staleDeadened,
    cleanedUp: maint.cleanedUp,
    elapsedMs: maint.elapsedMs,
  };
}
