// ChangeInboxItem 도메인 서비스.
//
// 두 축:
// 1. Fan-out (백그라운드 워커): LegalChangeEvent → DomainOutbox → 활성 Watch 매칭 → Inbox row upsert
// 2. 상태/평가 mutation (사용자 액션): open / assess / transition / assign
//
// 원칙 (R4.x 정책 이어받음):
// - Cross-workspace 결합 = 0 (composite FK 로 방어)
// - IDOR 는 workspace-scoped findFirst 로 NOT_FOUND
// - historical row 는 hard-delete 없음
// - fanout 은 idempotent (UNIQUE(workspaceId, changeEventId) 활용)

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AssessInboxInput } from "./validation";
import {
  INBOX_CLOSED_STATUSES,
  INBOX_TRANSITIONS,
  type InboxStatus,
} from "./labels";
import { generateInboxNotifications } from "@/lib/notifications/service";

export class InboxServiceError extends Error {
  code:
    | "INBOX_NOT_FOUND"
    | "INVALID_TRANSITION"
    | "MEMBER_NOT_IN_WORKSPACE"
    | "DEPARTMENT_NOT_IN_WORKSPACE";
  constructor(code: InboxServiceError["code"], message?: string) {
    super(message ?? code);
    this.name = "InboxServiceError";
    this.code = code;
  }
}

export interface InboxContext {
  workspaceId: string;
  memberId: string;
}

// ─────────────────────────────────────────────────────────────
// Fan-out
// ─────────────────────────────────────────────────────────────

const OUTBOX_EVENT_TYPE = "LEGAL_CHANGE_PUBLISHED";
const OUTBOX_AGGREGATE_TYPE = "LegalChangeEvent";
const OUTBOX_BATCH_LIMIT = Number(process.env.INBOX_FANOUT_BATCH ?? "50");

export interface FanOutReport {
  outboxEnqueued: number;     // 이번 실행에서 DomainOutbox 에 새로 등록된 이벤트 수
  outboxProcessed: number;    // 이번 실행에서 처리한 outbox row 수
  inboxCreated: number;       // 실제 새로 만든 ChangeInboxItem 수
  inboxSkipped: number;       // 이미 있어서 스킵
  outboxFailed: number;       // 처리 실패 (retry)
  elapsedMs: number;
}

// 1단계: notificationEligible=true 인데 아직 outbox 에 등록 안된 LegalChangeEvent 를 outbox 로.
// 2단계: outbox 를 claim → 활성 Watch 매칭 → ChangeInboxItem upsert.
export async function runInboxFanout(): Promise<FanOutReport> {
  const started = Date.now();
  const outboxEnqueued = await enqueueMissingOutboxRows();
  const consumeReport = await consumeOutboxBatch();
  return {
    outboxEnqueued,
    outboxProcessed: consumeReport.processed,
    inboxCreated: consumeReport.inboxCreated,
    inboxSkipped: consumeReport.inboxSkipped,
    outboxFailed: consumeReport.failed,
    elapsedMs: Date.now() - started,
  };
}

// 이벤트 → outbox 로 flush. dedupeKey unique 로 중복 방지.
async function enqueueMissingOutboxRows(): Promise<number> {
  // 최근 이벤트만 스캔 (성능): 최근 30일. 오래된 히스토리 이벤트는 이미 처리됐거나
  // notificationEligible=false (HISTORICAL_IMPORT).
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const missing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT e.id
      FROM legal_change_event e
     WHERE e.notification_eligible = TRUE
       AND e.detected_at >= ${since}
       AND NOT EXISTS (
         SELECT 1 FROM domain_outbox o
          WHERE o.aggregate_type = ${OUTBOX_AGGREGATE_TYPE}
            AND o.aggregate_id = e.id
            AND o.event_type = ${OUTBOX_EVENT_TYPE}
       )
     LIMIT 500
  `;
  if (missing.length === 0) return 0;

  let enqueued = 0;
  for (const row of missing) {
    try {
      await prisma.domainOutbox.create({
        data: {
          eventType: OUTBOX_EVENT_TYPE,
          aggregateType: OUTBOX_AGGREGATE_TYPE,
          aggregateId: row.id,
          dedupeKey: `${OUTBOX_EVENT_TYPE}:${row.id}`,
          payload: { changeEventId: row.id } as unknown as Prisma.InputJsonValue,
        },
      });
      enqueued += 1;
    } catch (err) {
      // dedupeKey unique 충돌 (동시 다른 워커) = 정상, 무시
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  return enqueued;
}

// Outbox 배치 claim + 처리.
async function consumeOutboxBatch(): Promise<{
  processed: number;
  inboxCreated: number;
  inboxSkipped: number;
  failed: number;
}> {
  const now = new Date();
  const workerId = `inbox-fanout-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  // Claim: FOR UPDATE SKIP LOCKED — 다른 워커와 안전하게 병렬
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM domain_outbox
       WHERE status IN ('PENDING', 'FAILED')
         AND event_type = ${OUTBOX_EVENT_TYPE}
         AND next_run_at <= ${now}
       ORDER BY next_run_at ASC
       LIMIT ${OUTBOX_BATCH_LIMIT}
       FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    await tx.domainOutbox.updateMany({
      where: { id: { in: ids } },
      data: { status: "PROCESSING", lockedAt: now, lockedBy: workerId, attemptCount: { increment: 1 } },
    });
    return rows.map((r) => r.id);
  });

  if (claimed.length === 0) return { processed: 0, inboxCreated: 0, inboxSkipped: 0, failed: 0 };

  let inboxCreated = 0;
  let inboxSkipped = 0;
  let failed = 0;

  for (const outboxId of claimed) {
    try {
      const result = await processSingleOutbox(outboxId);
      inboxCreated += result.created;
      inboxSkipped += result.skipped;
      await prisma.domainOutbox.update({
        where: { id: outboxId },
        data: { status: "DONE", processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
      });
    } catch (err) {
      failed += 1;
      await prisma.domainOutbox.update({
        where: { id: outboxId },
        data: {
          status: "FAILED",
          nextRunAt: new Date(Date.now() + 15 * 60 * 1000), // 15분 뒤 재시도
          lastError: (err as Error).message?.slice(0, 500),
          lockedAt: null,
          lockedBy: null,
        },
      });
    }
  }

  return { processed: claimed.length, inboxCreated, inboxSkipped, failed };
}

async function processSingleOutbox(outboxId: string): Promise<{ created: number; skipped: number }> {
  const outbox = await prisma.domainOutbox.findUniqueOrThrow({
    where: { id: outboxId },
    select: { aggregateId: true },
  });
  const event = await prisma.legalChangeEvent.findUnique({
    where: { id: outbox.aggregateId },
    select: { id: true, documentId: true, notificationEligible: true },
  });
  if (!event || !event.notificationEligible) {
    return { created: 0, skipped: 0 }; // 이벤트 사라짐 or 소급 무효화 → DONE 처리
  }

  // 활성 Watch 매칭 + scope 정보 로드
  const watches = await prisma.watch.findMany({
    where: {
      documentId: event.documentId,
      status: "ACTIVE",
      notifyOnChange: true,
      archivedAt: null,
      workspace: { status: "ACTIVE" },
    },
    select: {
      id: true,
      workspaceId: true,
      ownerDepartmentId: true,
      ownerMemberId: true,
      importance: true,
      contentScopes: { select: { contentUnitId: true } },
    },
  });

  // Scope 있는 Watch 가 있으면 이 이벤트에 영향받은 contentUnit 목록도 미리 로드.
  const anyScoped = watches.some((w) => w.contentScopes.length > 0);
  let affectedContentUnitIds: Set<string> | null = null;
  if (anyScoped) {
    const diffs = await prisma.legalDiff.findMany({
      where: { changeEventId: event.id, contentUnitId: { not: null } },
      select: { contentUnitId: true },
    });
    affectedContentUnitIds = new Set(diffs.map((d) => d.contentUnitId!).filter(Boolean));
  }

  let created = 0;
  let skipped = 0;
  for (const w of watches) {
    // 조문 scope 필터링: scope 있는 Watch 는 매칭 조문이 이번 이벤트에서 변경된 경우에만.
    if (w.contentScopes.length > 0 && affectedContentUnitIds) {
      const hit = w.contentScopes.some((s) => affectedContentUnitIds!.has(s.contentUnitId));
      if (!hit) { skipped += 1; continue; }
    }

    // UNIQUE(workspaceId, changeEventId) → 중복 시 skipDuplicates
    try {
      const newInbox = await prisma.changeInboxItem.create({
        data: {
          workspaceId: w.workspaceId,
          changeEventId: event.id,
          watchId: w.id,
          status: "NEW",
          applicability: "UNKNOWN",
          priority: mapWatchImportanceToPriority(w.importance),
          ownerDepartmentId: w.ownerDepartmentId,
          assignedToMemberId: w.ownerMemberId,
          firstNotifiedAt: new Date(),
        },
        select: { id: true },
      });
      created += 1;

      // 알림 fan-out — 실패해도 outbox 는 성공 처리 (다음 실행에서 dedupeKey 로 재시도 안전).
      try {
        await generateInboxNotifications(newInbox.id);
      } catch (e) {
        console.error("[fanout] notification generation failed:", (e as Error).message);
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }
  return { created, skipped };
}

function mapWatchImportanceToPriority(importance: string): string {
  // Watch.importance {LOW, NORMAL, HIGH, URGENT} → Inbox.priority {LOW, NORMAL, HIGH, URGENT}
  switch (importance) {
    case "URGENT": return "URGENT";
    case "HIGH":   return "HIGH";
    case "LOW":    return "LOW";
    default:       return "NORMAL";
  }
}

// ─────────────────────────────────────────────────────────────
// 라운드 19-A2: Watch 생성/재활성화 훅용 소급 fanout
// ─────────────────────────────────────────────────────────────
//
// 배경: 기존 fanout 은 "Event 기준"으로만 돔. Event 가 이미 outbox 에 DONE 처리된 상태에서
// Watch 가 새로 생성되면, 그 Watch 는 기존 Event 에 대해 아무 인박스 아이템도 못 받음.
// (실측: 개인정보 보호법 D-20 개정이 DB 에 있는데 새 Watch 등록해도 인박스 0)
//
// 해결: Watch 생성/재활성화 시 즉시 그 문서의 eligible + 미래 시행일 Event 목록을 훑어
// 이 Watch 에 대한 InboxItem 을 개별 생성. UNIQUE(workspaceId, changeEventId) 로 중복 방지.
export async function fanoutForWatch(watchId: string): Promise<{ created: number; skipped: number }> {
  const watch = await prisma.watch.findUnique({
    where: { id: watchId },
    select: {
      id: true,
      workspaceId: true,
      documentId: true,
      status: true,
      notifyOnChange: true,
      archivedAt: true,
      ownerDepartmentId: true,
      ownerMemberId: true,
      importance: true,
      workspace: { select: { status: true } },
      contentScopes: { select: { contentUnitId: true } },
    },
  });
  if (!watch) return { created: 0, skipped: 0 };
  if (
    watch.status !== "ACTIVE" ||
    !watch.notifyOnChange ||
    watch.archivedAt !== null ||
    watch.workspace.status !== "ACTIVE"
  ) {
    return { created: 0, skipped: 0 };
  }

  // 미래 시행일 + eligible + PUBLISHED 인 이벤트만 대상.
  // 과거 시행일은 이미 지나서 소급 알림해도 실행 액션이 없음.
  const events = await prisma.legalChangeEvent.findMany({
    where: {
      documentId: watch.documentId,
      status: "PUBLISHED",
      notificationEligible: true,
      effectiveDate: { gt: new Date() },
    },
    select: { id: true },
    orderBy: { effectiveDate: "asc" },
  });
  if (events.length === 0) return { created: 0, skipped: 0 };

  const anyScoped = watch.contentScopes.length > 0;

  let created = 0;
  let skipped = 0;
  for (const event of events) {
    // scope 있는 Watch 는 해당 이벤트에서 조문 변경이 있어야만.
    if (anyScoped) {
      const diffs = await prisma.legalDiff.findMany({
        where: { changeEventId: event.id, contentUnitId: { not: null } },
        select: { contentUnitId: true },
      });
      const affected = new Set(diffs.map((d) => d.contentUnitId!).filter(Boolean) as string[]);
      const hit = watch.contentScopes.some((s) => affected.has(s.contentUnitId));
      if (!hit) { skipped += 1; continue; }
    }

    try {
      const newInbox = await prisma.changeInboxItem.create({
        data: {
          workspaceId: watch.workspaceId,
          changeEventId: event.id,
          watchId: watch.id,
          status: "NEW",
          applicability: "UNKNOWN",
          priority: mapWatchImportanceToPriority(watch.importance),
          ownerDepartmentId: watch.ownerDepartmentId,
          assignedToMemberId: watch.ownerMemberId,
          firstNotifiedAt: new Date(),
        },
        select: { id: true },
      });
      created += 1;
      try {
        await generateInboxNotifications(newInbox.id);
      } catch (e) {
        console.error("[watch-fanout] notification generation failed:", (e as Error).message);
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }
  return { created, skipped };
}

// ─────────────────────────────────────────────────────────────
// Lifecycle mutations
// ─────────────────────────────────────────────────────────────

// 사용자가 항목을 처음 열면 REVIEWING 으로 자동 전환.
export async function openInboxItem(ctx: InboxContext, inboxId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await tx.changeInboxItem.findFirst({
      where: { id: inboxId, workspaceId: ctx.workspaceId },
      select: { id: true, status: true, openedAt: true },
    });
    if (!item) throw new InboxServiceError("INBOX_NOT_FOUND");

    const data: Prisma.ChangeInboxItemUpdateInput = {};
    if (!item.openedAt) data.openedAt = new Date();
    if (item.status === "NEW") data.status = "REVIEWING";
    if (Object.keys(data).length === 0) return;

    await tx.changeInboxItem.update({ where: { id: item.id }, data });

    if (item.status === "NEW") {
      await writeAudit(tx, ctx, "INBOX_OPENED", item.id, {
        before: { status: item.status }, after: { status: "REVIEWING" },
      });
    }
  });
}

// 상태 전환 (REVIEWING → DONE / DISMISSED / ACTION_REQUIRED / MONITORING, 등).

export async function transitionInboxItem(
  ctx: InboxContext,
  inboxId: string,
  nextStatus: InboxStatus,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await tx.changeInboxItem.findFirst({
      where: { id: inboxId, workspaceId: ctx.workspaceId },
      select: { id: true, status: true, reviewedAt: true, completedAt: true, dismissedAt: true },
    });
    if (!item) throw new InboxServiceError("INBOX_NOT_FOUND");
    if (item.status === nextStatus) return; // idempotent

    const allowed = INBOX_TRANSITIONS[item.status as InboxStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new InboxServiceError("INVALID_TRANSITION", `${item.status} → ${nextStatus}`);
    }

    const now = new Date();
    const data: Prisma.ChangeInboxItemUpdateInput = { status: nextStatus };
    if (nextStatus === "REVIEWING" && !item.reviewedAt) data.reviewedAt = now;
    if (nextStatus === "DONE") data.completedAt = now;
    if (nextStatus === "DISMISSED") data.dismissedAt = now;
    if (INBOX_CLOSED_STATUSES.includes(nextStatus) === false) {
      // 재개 시 완료/기각 시각 초기화
      data.completedAt = null;
      data.dismissedAt = null;
    }

    await tx.changeInboxItem.update({ where: { id: item.id }, data });
    await writeAudit(tx, ctx, `INBOX_TRANSITION`, item.id, {
      before: { status: item.status }, after: { status: nextStatus },
    });
  });
}

// 평가/할당 필드 저장.
export async function assessInboxItem(
  ctx: InboxContext,
  inboxId: string,
  input: AssessInboxInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await tx.changeInboxItem.findFirst({
      where: { id: inboxId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!item) throw new InboxServiceError("INBOX_NOT_FOUND");

    if (input.ownerDepartmentId != null) {
      const d = await tx.department.findFirst({
        where: { id: input.ownerDepartmentId, workspaceId: ctx.workspaceId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!d) throw new InboxServiceError("DEPARTMENT_NOT_IN_WORKSPACE");
    }
    if (input.assignedToMemberId != null) {
      const m = await tx.workspaceMember.findFirst({
        where: { id: input.assignedToMemberId, workspaceId: ctx.workspaceId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!m) throw new InboxServiceError("MEMBER_NOT_IN_WORKSPACE");
    }

    // 주의: ownerDepartment / assignedToMember 는 composite FK
    // (fields: [xxxId, workspaceId]) 라서 `disconnect: true` 를 쓰면 required 인
    // workspaceId 를 null 로 세팅하다 트랜잭션이 폭발한다 (watches 라운드 6 503 원인과 동일).
    // scalar 컬럼만 갱신하면 workspaceId 는 그대로 유지되고, FK 정합성은 위의 assertXxx 로 확인됨.
    const data: Prisma.ChangeInboxItemUncheckedUpdateInput = {};
    if (input.applicability !== undefined) data.applicability = input.applicability;
    if (input.applicabilityReason !== undefined) data.applicabilityReason = input.applicabilityReason;
    if (input.impactLevel !== undefined) data.impactLevel = input.impactLevel;
    if (input.assessmentText !== undefined) data.assessmentText = input.assessmentText;
    if (input.ownerDepartmentId !== undefined) data.ownerDepartmentId = input.ownerDepartmentId;
    if (input.assignedToMemberId !== undefined) data.assignedToMemberId = input.assignedToMemberId;
    if (Object.keys(data).length === 0) return;

    await tx.changeInboxItem.update({ where: { id: item.id }, data });

    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) changed[k] = v;
    }
    await writeAudit(tx, ctx, "INBOX_ASSESSED", item.id, { after: changed });
  });
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function writeAudit(
  tx: Prisma.TransactionClient,
  ctx: InboxContext,
  action: string,
  inboxId: string,
  data: { before?: Record<string, unknown>; after?: Record<string, unknown> },
) {
  await tx.workspaceAuditLog.create({
    data: {
      workspaceId: ctx.workspaceId,
      actorMemberId: ctx.memberId,
      action,
      entityType: "ChangeInboxItem",
      entityId: inboxId,
      beforeData: (data.before ?? undefined) as Prisma.InputJsonValue | undefined,
      afterData: (data.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
