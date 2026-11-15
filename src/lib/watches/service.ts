// Watch domain service. UI/API 는 이 헬퍼만 호출한다.
//
// 원칙:
// - workspaceId 는 항상 서버 세션에서 온다 (호출자가 clients 로부터 workspaceId 를 받지 않음).
// - Watch identity = UNIQUE(workspaceId, documentId).
// - Create 는 idempotent + concurrent-safe.
// - Archive 는 hard-delete 가 아니다 (status=ARCHIVED + archivedAt).
// - 모든 mutation 은 같은 transaction 안에서 WorkspaceAuditLog 기록.
// - Cross-workspace member/department 지정은 조기 reject (defense-in-depth).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fanoutForWatch } from "@/lib/inbox/service";
import type { UpdateWatchInput } from "./validation";

export class WatchServiceError extends Error {
  code:
    | "DOCUMENT_NOT_FOUND"
    | "WATCH_NOT_FOUND"
    | "MEMBER_NOT_IN_WORKSPACE"
    | "DEPARTMENT_NOT_IN_WORKSPACE"
    | "FOLDER_NOT_IN_WORKSPACE";
  constructor(code: WatchServiceError["code"], message?: string) {
    super(message ?? code);
    this.name = "WatchServiceError";
    this.code = code;
  }
}

export interface WatchContext {
  workspaceId: string;
  memberId: string; // 액션 수행 member
}

export interface CreateOrReactivateResult {
  watch: { id: string; status: string; documentId: string };
  outcome: "CREATED" | "REACTIVATED" | "ALREADY_ACTIVE";
}

// Watch 등록: 없으면 생성, ARCHIVED 면 재활성화, ACTIVE 면 그대로 반환.
// 라운드 19-A2: CREATED/REACTIVATED 결과에 대해 트랜잭션 커밋 후 소급 fanout 실행.
// 심사 재현: 기존 Watch 는 잘 됐지만 새 Watch 등록 시 이미 있는 미래 개정이 인박스에 안 뜸.
export async function createOrReactivateWatch(
  ctx: WatchContext,
  documentId: string,
): Promise<CreateOrReactivateResult> {
  const result = await prisma.$transaction(async (tx) => {
    // 문서 존재 확인 (global corpus)
    const doc = await tx.legalDocument.findUnique({
      where: { id: documentId },
      select: { id: true },
    });
    if (!doc) throw new WatchServiceError("DOCUMENT_NOT_FOUND");

    // 기존 Watch 조회
    const existing = await tx.watch.findUnique({
      where: { workspaceId_documentId: { workspaceId: ctx.workspaceId, documentId } },
      select: { id: true, status: true, archivedAt: true },
    });

    if (existing) {
      if (existing.status === "ACTIVE") {
        return {
          watch: { id: existing.id, status: "ACTIVE", documentId },
          outcome: "ALREADY_ACTIVE" as const,
        };
      }
      // 재활성화
      const updated = await tx.watch.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", archivedAt: null },
        select: { id: true, status: true, documentId: true },
      });
      await writeAudit(tx, ctx, "WATCH_REACTIVATED", updated.id, {
        before: { status: existing.status },
        after: { status: "ACTIVE" },
      });
      return { watch: updated, outcome: "REACTIVATED" as const };
    }

    // 신규 create — 동시 요청은 UNIQUE(workspaceId, documentId) 로 방어 (아래 try/catch)
    try {
      const created = await tx.watch.create({
        data: {
          workspaceId: ctx.workspaceId,
          documentId,
          createdByMemberId: ctx.memberId,
          status: "ACTIVE",
          // 관심 등록의 목적 자체가 "바뀌면 알려달라"이므로 알림은 기본 ON.
          // 스키마 default 는 인앱이 주 채널이던 시절의 false 라, 여기서 명시한다.
          // (이 값이 빠져 있어서 기존 관심 법령 9건이 전부 알림 OFF 였다.)
          notifyEmail: true,
        },
        select: { id: true, status: true, documentId: true },
      });
      await writeAudit(tx, ctx, "WATCH_CREATED", created.id, {
        after: { status: "ACTIVE", documentId },
      });
      return { watch: created, outcome: "CREATED" as const };
    } catch (err) {
      // Race: 다른 요청이 방금 만들었음 → 재조회하여 idempotent 성공 응답
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await tx.watch.findUniqueOrThrow({
          where: { workspaceId_documentId: { workspaceId: ctx.workspaceId, documentId } },
          select: { id: true, status: true, documentId: true },
        });
        return { watch: winner, outcome: "ALREADY_ACTIVE" as const };
      }
      throw err;
    }
  });

  // 라운드 19-A2: 소급 fanout — 트랜잭션 밖에서 실행해 실패해도 Watch 생성 자체는 커밋 유지.
  // ALREADY_ACTIVE 는 이미 fanout 을 받았을 것이므로 스킵.
  if (result.outcome === "CREATED" || result.outcome === "REACTIVATED") {
    try {
      const report = await fanoutForWatch(result.watch.id);
      if (report.created > 0) {
        console.info(`[watch-service] retro-fanout ${result.watch.id}: created=${report.created} skipped=${report.skipped}`);
      }
    } catch (err) {
      console.error("[watch-service] retro-fanout failed:", (err as Error).message);
    }
  }

  return result;
}

// Archive: hard delete 대신 status=ARCHIVED + archivedAt.
export async function archiveWatch(ctx: WatchContext, watchId: string): Promise<void> {
  const previousStatus = await prisma.$transaction(async (tx) => {
    const w = await tx.watch.findFirst({
      where: { id: watchId, workspaceId: ctx.workspaceId },
      select: { id: true, status: true },
    });
    if (!w) throw new WatchServiceError("WATCH_NOT_FOUND"); // IDOR: cross-workspace = NOT_FOUND
    if (w.status === "ARCHIVED") return null; // idempotent

    await tx.watch.update({
      where: { id: w.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return w.status;
  });

  // Audit — 트랜잭션 밖. 감사 로그 FK/timeout 로 primary write 가 rollback 되던 라운드 7 회귀 방지
  // ("관심 해제 30초 프리징 후 상태 변경 자체가 실패" 케이스). updateWatch 와 동일 패턴.
  if (previousStatus !== null) {
    try {
      await writeAudit(prisma, ctx, "WATCH_ARCHIVED", watchId, {
        before: { status: previousStatus },
        after: { status: "ARCHIVED" },
      });
    } catch (auditErr) {
      console.warn("[watches] archive audit failed (primary write committed)", {
        watchId,
        err: (auditErr as Error).message,
      });
    }
  }
}

// Watch 메타데이터 업데이트 (applicability/importance/dept/member/review/notify/folder).
export async function updateWatch(
  ctx: WatchContext,
  watchId: string,
  input: UpdateWatchInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const w = await tx.watch.findFirst({
      where: { id: watchId, workspaceId: ctx.workspaceId },
      select: {
        id: true,
        applicabilityStatus: true,
        applicabilityReason: true,
        importance: true,
        ownerDepartmentId: true,
        ownerMemberId: true,
        reviewFrequencyMonths: true,
        notifyOnChange: true,
        notifyEmail: true,
        folderId: true,
        lastReviewedAt: true,
      },
    });
    if (!w) throw new WatchServiceError("WATCH_NOT_FOUND");

    // Cross-workspace defense (composite FK 도 방어하지만 raw error 대신 명확한 domain error)
    if (input.ownerMemberId != null) {
      await assertMemberInWorkspace(tx, ctx.workspaceId, input.ownerMemberId);
    }
    if (input.ownerDepartmentId != null) {
      await assertDepartmentInWorkspace(tx, ctx.workspaceId, input.ownerDepartmentId);
    }
    if (input.folderId != null) {
      await assertFolderInWorkspace(tx, ctx.workspaceId, input.folderId);
    }

    // 주의: ownerDepartment / ownerMember / folder 는 composite FK(fields: [xxxId, workspaceId]).
    // workspaceId 는 required 라서 `disconnect: true` 를 쓰면 Prisma 가 workspaceId 를 null 로
    // 세팅하려다 실패한다(그것이 이전 라운드의 503 원인). scalar 컬럼(xxxId)만 갱신하면
    // workspaceId 는 그대로 유지되고, DB 레벨에서 FK 정합성은 assertXxxInWorkspace 로 이미 확인됨.
    const data: Prisma.WatchUncheckedUpdateInput = {};
    if (input.applicabilityStatus !== undefined) data.applicabilityStatus = input.applicabilityStatus;
    if (input.applicabilityReason !== undefined) data.applicabilityReason = input.applicabilityReason;
    if (input.importance !== undefined) data.importance = input.importance;
    if (input.ownerDepartmentId !== undefined) data.ownerDepartmentId = input.ownerDepartmentId;
    if (input.ownerMemberId !== undefined) data.ownerMemberId = input.ownerMemberId;
    if (input.folderId !== undefined) data.folderId = input.folderId;
    if (input.reviewFrequencyMonths !== undefined) {
      data.reviewFrequencyMonths = input.reviewFrequencyMonths;
      // nextReviewAt 재계산
      if (input.reviewFrequencyMonths && input.reviewFrequencyMonths > 0) {
        const base = w.lastReviewedAt ?? new Date();
        data.nextReviewAt = addMonths(base, input.reviewFrequencyMonths);
      } else {
        data.nextReviewAt = null;
      }
    }
    if (input.notifyOnChange !== undefined) data.notifyOnChange = input.notifyOnChange;
    if (input.notifyEmail !== undefined) data.notifyEmail = input.notifyEmail;

    if (Object.keys(data).length === 0) return;

    await tx.watch.update({ where: { id: w.id }, data });
  });

  // Audit — 트랜잭션 밖에서 별도 write. FK 오류·타임아웃으로 감사만 실패해도
  // 사용자의 판단 기록(primary write)은 이미 커밋된 상태를 유지한다.
  // 이전 라운드에서 "저장 실패의 거짓 성공 피드백" 원인 후보 중 하나였음.
  const changed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) changed[k] = v;
  }
  try {
    await writeAudit(prisma, ctx, "WATCH_UPDATED", watchId, { after: changed });
  } catch (auditErr) {
    console.warn("[watches] audit failed (primary update committed)", {
      watchId,
      err: (auditErr as Error).message,
    });
  }
}

// 검토 완료: lastReviewedAt=now + reviewFrequency 기반 nextReviewAt 재계산.
// 클라이언트가 router.refresh 없이 로컬 UI 를 즉시 갱신할 수 있도록 갱신된 날짜들을 반환.
export async function markWatchReviewed(
  ctx: WatchContext,
  watchId: string,
): Promise<{ lastReviewedAt: string; nextReviewAt: string | null }> {
  const result = await prisma.$transaction(async (tx) => {
    const w = await tx.watch.findFirst({
      where: { id: watchId, workspaceId: ctx.workspaceId },
      select: { id: true, reviewFrequencyMonths: true },
    });
    if (!w) throw new WatchServiceError("WATCH_NOT_FOUND");

    const now = new Date();
    const next = w.reviewFrequencyMonths && w.reviewFrequencyMonths > 0
      ? addMonths(now, w.reviewFrequencyMonths)
      : null;

    await tx.watch.update({
      where: { id: w.id },
      data: { lastReviewedAt: now, nextReviewAt: next },
    });
    return { lastReviewedAt: now.toISOString(), nextReviewAt: next?.toISOString() ?? null };
  });

  // Audit 는 트랜잭션 밖 — 감사 실패가 primary write 를 롤백하지 않도록.
  try {
    await writeAudit(prisma, ctx, "WATCH_REVIEWED", watchId, {
      after: { lastReviewedAt: result.lastReviewedAt },
    });
  } catch (auditErr) {
    console.warn("[watches] reviewed audit failed (primary write committed)", {
      watchId,
      err: (auditErr as Error).message,
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function assertMemberInWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  memberId: string,
) {
  const m = await tx.workspaceMember.findFirst({
    where: { id: memberId, workspaceId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!m) throw new WatchServiceError("MEMBER_NOT_IN_WORKSPACE");
}

async function assertDepartmentInWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  departmentId: string,
) {
  const d = await tx.department.findFirst({
    where: { id: departmentId, workspaceId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!d) throw new WatchServiceError("DEPARTMENT_NOT_IN_WORKSPACE");
}

async function assertFolderInWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  folderId: string,
) {
  const f = await tx.folder.findFirst({
    where: { id: folderId, workspaceId },
    select: { id: true },
  });
  if (!f) throw new WatchServiceError("FOLDER_NOT_IN_WORKSPACE");
}

async function writeAudit(
  tx: Prisma.TransactionClient | typeof prisma,
  ctx: WatchContext,
  action: string,
  watchId: string,
  data: { before?: Record<string, unknown>; after?: Record<string, unknown> },
) {
  await tx.workspaceAuditLog.create({
    data: {
      workspaceId: ctx.workspaceId,
      actorMemberId: ctx.memberId,
      action,
      entityType: "Watch",
      entityId: watchId,
      beforeData: (data.before ?? undefined) as Prisma.InputJsonValue | undefined,
      afterData: (data.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}
