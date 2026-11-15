import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminSession } from "@/lib/security/auth";
import { writeAudit } from "@/lib/security/audit";
import {
  runCatalogSync,
  runCollectorMaintenance,
  runFullCatalogBootstrap,
  runJobBatch,
  runMonthlyReconciliation,
  runWeeklyIntegrityCheck,
} from "@/lib/collector/orchestrator";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run_catalog_sync"), recentDays: z.number().int().min(1).max(180).optional() }),
  z.object({ action: z.literal("run_jobs"), batchSize: z.number().int().min(1).max(50).optional() }),
  z.object({ action: z.literal("run_maintenance") }),
  z.object({ action: z.literal("run_weekly_integrity") }),
  z.object({ action: z.literal("run_monthly_reconciliation"), sourceType: z.enum(["LAW", "ADMIN_RULE"]).optional() }),
  z.object({
    action: z.literal("run_bootstrap"),
    sourceType: z.enum(["LAW", "ADMIN_RULE"]),
    scope: z.string().min(1).max(80).optional(),
    maxPagesPerRun: z.number().int().min(1).max(200).optional(),
    reset: z.boolean().optional(),
  }),
  z.object({ action: z.literal("retry_job"), jobId: z.string().min(1) }),
  z.object({ action: z.literal("mark_job_dead"), jobId: z.string().min(1) }),
]);

const ACTOR = "admin";

export async function POST(req: Request) {
  const session = checkAdminSession();
  if (!session.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  try {
    switch (input.action) {
      case "run_catalog_sync": {
        const report = await runCatalogSync({ recentDays: input.recentDays ?? 45 });
        await writeAudit({ actor: ACTOR, action: input.action, payload: report });
        return NextResponse.json({ ok: true, report });
      }
      case "run_jobs": {
        const report = await runJobBatch({ batchSize: input.batchSize ?? 15, workerLabel: "admin-manual" });
        await writeAudit({ actor: ACTOR, action: input.action, payload: report });
        return NextResponse.json({ ok: true, report });
      }
      case "run_maintenance": {
        const report = await runCollectorMaintenance();
        await writeAudit({ actor: ACTOR, action: input.action, payload: report });
        return NextResponse.json({ ok: true, report });
      }
      case "run_weekly_integrity": {
        const report = await runWeeklyIntegrityCheck();
        await writeAudit({ actor: ACTOR, action: input.action, payload: report });
        return NextResponse.json({ ok: true, report });
      }
      case "run_monthly_reconciliation": {
        const report = await runMonthlyReconciliation({ sourceType: input.sourceType ?? "LAW" });
        await writeAudit({ actor: ACTOR, action: input.action, payload: report });
        return NextResponse.json({ ok: true, report });
      }
      case "run_bootstrap": {
        const report = await runFullCatalogBootstrap({
          sourceType: input.sourceType,
          scope: input.scope,
          maxPagesPerRun: input.maxPagesPerRun ?? 10,
          reset: input.reset,
        });
        await writeAudit({ actor: ACTOR, action: input.action, payload: report });
        return NextResponse.json({ ok: true, report });
      }
      case "retry_job": {
        // 전이 전 상태 확인 → 조건부 update → 감사 기록
        const before = await prisma.collectorJob.findUnique({
          where: { id: input.jobId },
          select: { status: true },
        });
        if (!before) {
          await writeAudit({
            actor: ACTOR,
            action: input.action,
            target: input.jobId,
            outcome: "conflict",
            errorMessage: "job not found",
          });
          return NextResponse.json({ ok: false, conflict: true, currentStatus: null }, { status: 409 });
        }
        // FAILED/DEAD/RETRY 만 재시도 가능. RUNNING/DONE/PENDING 은 대상 아님.
        const result = await prisma.collectorJob.updateMany({
          where: {
            id: input.jobId,
            status: { in: ["FAILED", "DEAD", "RETRY"] },
          },
          data: {
            status: "PENDING",
            nextRunAt: new Date(),
            attemptCount: 0,
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          },
        });
        if (result.count === 0) {
          await writeAudit({
            actor: ACTOR,
            action: input.action,
            target: input.jobId,
            beforeStatus: before.status,
            outcome: "conflict",
            errorMessage: `Cannot retry from status=${before.status}`,
          });
          return NextResponse.json(
            { ok: false, conflict: true, currentStatus: before.status },
            { status: 409 },
          );
        }
        await writeAudit({
          actor: ACTOR,
          action: input.action,
          target: input.jobId,
          beforeStatus: before.status,
          afterStatus: "PENDING",
        });
        return NextResponse.json({ ok: true, jobId: input.jobId, previousStatus: before.status });
      }
      case "mark_job_dead": {
        const before = await prisma.collectorJob.findUnique({
          where: { id: input.jobId },
          select: { status: true },
        });
        if (!before) {
          await writeAudit({
            actor: ACTOR,
            action: input.action,
            target: input.jobId,
            outcome: "conflict",
            errorMessage: "job not found",
          });
          return NextResponse.json({ ok: false, conflict: true, currentStatus: null }, { status: 409 });
        }
        const result = await prisma.collectorJob.updateMany({
          where: {
            id: input.jobId,
            status: { in: ["FAILED", "RETRY", "PENDING"] },
          },
          data: { status: "DEAD", lockedAt: null, lockedBy: null, finishedAt: new Date() },
        });
        if (result.count === 0) {
          await writeAudit({
            actor: ACTOR,
            action: input.action,
            target: input.jobId,
            beforeStatus: before.status,
            outcome: "conflict",
            errorMessage: `Cannot mark dead from status=${before.status}`,
          });
          return NextResponse.json(
            { ok: false, conflict: true, currentStatus: before.status },
            { status: 409 },
          );
        }
        await writeAudit({
          actor: ACTOR,
          action: input.action,
          target: input.jobId,
          beforeStatus: before.status,
          afterStatus: "DEAD",
        });
        return NextResponse.json({ ok: true, jobId: input.jobId, previousStatus: before.status });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeAudit({
      actor: ACTOR,
      action: input.action,
      outcome: "error",
      errorMessage: message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
