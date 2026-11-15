import { prisma } from "@/lib/prisma";

export interface CollectorStatusSnapshot {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastRun: RunSummary | null;
  runs: RunSummary[];
  jobsByStatus: Record<string, number>;
  latestFailedJobs: FailedJob[];
  documentCount: number;
  documentCountByType: { sourceType: string; count: number }[];
  versionCount: number;
  changeEventCount: number;
  bootstrapProgress: BootstrapProgressRow[];
  auditLog: AuditLogRow[];
}

export interface BootstrapProgressRow {
  id: string;
  sourceType: string;
  scope: string;
  cursorPage: number;
  totalCount: number;
  scannedCount: number;
  enqueuedCount: number;
  status: string;
  startedAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  lastError: string | null;
  progressPercent: number;
}

export interface AuditLogRow {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  outcome: string;
  errorMessage: string | null;
  createdAt: Date;
}

export interface RunSummary {
  id: string;
  jobType: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  elapsedMs: number | null;
  scannedCount: number;
  newCount: number;
  changedCount: number;
  successCount: number;
  failCount: number;
  staleRecoveredCount: number;
  errorMessage: string | null;
}

export interface FailedJob {
  id: string;
  jobType: string;
  sourceType: string;
  sourceId: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  updatedAt: Date;
}

export async function getCollectorStatus(): Promise<CollectorStatusSnapshot> {
  const [
    lastSuccessRun,
    lastFailureRun,
    runs,
    jobsGroup,
    latestFailedJobs,
    documentCount,
    documentGroup,
    versionCount,
    changeEventCount,
  ] = await Promise.all([
    prisma.collectorRun.findFirst({
      where: { status: "success" },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true, startedAt: true },
    }),
    prisma.collectorRun.findFirst({
      where: { status: { in: ["failed", "partial_success"] } },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true, startedAt: true },
    }),
    prisma.collectorRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    prisma.collectorJob.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
    prisma.collectorJob.findMany({
      where: { status: { in: ["FAILED", "DEAD", "RETRY"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.legalDocument.count(),
    prisma.legalDocument.groupBy({
      by: ["legalSourceId"],
      _count: { legalSourceId: true },
    }),
    prisma.legalDocumentVersion.count(),
    prisma.legalChangeEvent.count(),
  ]);
  const [bootstrapRows, auditRows] = await Promise.all([
    prisma.bootstrapProgress.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const jobsByStatus: Record<string, number> = {
    PENDING: 0,
    RUNNING: 0,
    RETRY: 0,
    DONE: 0,
    FAILED: 0,
    DEAD: 0,
  };
  for (const g of jobsGroup) {
    jobsByStatus[g.status] = g._count.status;
  }

  return {
    lastSuccessAt: lastSuccessRun?.finishedAt ?? lastSuccessRun?.startedAt ?? null,
    lastFailureAt: lastFailureRun?.finishedAt ?? lastFailureRun?.startedAt ?? null,
    lastRun: runs[0] ? summarize(runs[0]) : null,
    runs: runs.map(summarize),
    jobsByStatus,
    latestFailedJobs: latestFailedJobs.map((j) => ({
      id: j.id,
      jobType: j.jobType,
      sourceType: j.sourceType,
      sourceId: j.sourceId,
      status: j.status,
      attemptCount: j.attemptCount,
      lastError: j.lastError,
      updatedAt: j.updatedAt,
    })),
    documentCount,
    documentCountByType: documentGroup.map((g) => ({
      // 마이그레이션 v7 시드된 LegalSource ID를 sourceType으로 역매핑
      sourceType: g.legalSourceId === "src_kr_moleg_law" ? "LAW"
        : g.legalSourceId === "src_kr_moleg_rule" ? "ADMIN_RULE"
        : g.legalSourceId,
      count: g._count.legalSourceId,
    })),
    versionCount,
    changeEventCount,
    bootstrapProgress: bootstrapRows.map((b) => ({
      id: b.id,
      sourceType: b.sourceType,
      scope: b.scope,
      cursorPage: b.cursorPage,
      totalCount: b.totalCount,
      scannedCount: b.rawScannedCount,
      enqueuedCount: b.enqueuedCount,
      status: b.status,
      startedAt: b.startedAt,
      updatedAt: b.updatedAt,
      finishedAt: b.finishedAt,
      lastError: b.lastError,
      progressPercent: b.totalCount > 0
        ? Math.min(100, Math.round((b.rawScannedCount / b.totalCount) * 100))
        : 0,
    })),
    auditLog: auditRows.map((a) => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      target: a.target,
      outcome: a.outcome,
      errorMessage: a.errorMessage,
      createdAt: a.createdAt,
    })),
  };
}

function summarize(r: {
  id: string;
  jobType: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  scannedCount: number;
  newCount: number;
  changedCount: number;
  successCount: number;
  failCount: number;
  staleRecoveredCount: number;
  errorMessage: string | null;
}): RunSummary {
  return {
    id: r.id,
    jobType: r.jobType,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    elapsedMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
    scannedCount: r.scannedCount,
    newCount: r.newCount,
    changedCount: r.changedCount,
    successCount: r.successCount,
    failCount: r.failCount,
    staleRecoveredCount: r.staleRecoveredCount,
    errorMessage: r.errorMessage,
  };
}
