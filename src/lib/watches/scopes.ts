// Watch content-scope (조문 단위 Watch) 서비스.
//
// 정책:
// - Watch 는 기본적으로 "문서 전체" 를 감시. WatchContentScope 가 하나라도 있으면
//   해당 조문에만 좁혀 감시 (fanout 필터링에 반영).
// - Scope 는 반드시 같은 workspace + 같은 documentId 의 ContentUnit 이어야 함
//   (v9 composite FK 로 강제).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WatchServiceError, type WatchContext } from "./service";

// 문서의 ContentUnit 옵션 (Watch scope 선택 UI 용).
export async function listContentUnitsForDocument(documentId: string, limit = 500) {
  return prisma.legalContentUnit.findMany({
    where: { documentId, status: "ACTIVE" },
    orderBy: [{ unitType: "asc" }, { canonicalKey: "asc" }],
    take: limit,
    select: {
      id: true,
      unitType: true,
      canonicalKey: true,
      currentLabel: true,
    },
  });
}

// 특정 Watch 의 현재 scope 목록.
export async function listScopesForWatch(workspaceId: string, watchId: string) {
  const w = await prisma.watch.findFirst({
    where: { id: watchId, workspaceId },
    select: { id: true, documentId: true },
  });
  if (!w) throw new WatchServiceError("WATCH_NOT_FOUND");

  const scopes = await prisma.watchContentScope.findMany({
    where: { watchId: w.id },
    include: {
      contentUnit: {
        select: { id: true, unitType: true, canonicalKey: true, currentLabel: true },
      },
    },
  });
  return { documentId: w.documentId, scopes };
}

// Scope 추가. idempotent.
export async function addWatchScope(
  ctx: WatchContext,
  watchId: string,
  contentUnitId: string,
): Promise<{ scopeId: string }> {
  return prisma.$transaction(async (tx) => {
    const w = await tx.watch.findFirst({
      where: { id: watchId, workspaceId: ctx.workspaceId },
      select: { id: true, workspaceId: true, documentId: true },
    });
    if (!w) throw new WatchServiceError("WATCH_NOT_FOUND");

    // ContentUnit 이 같은 문서 소속인지 검증 (composite FK 로도 방어되지만 UX friendly error)
    const cu = await tx.legalContentUnit.findFirst({
      where: { id: contentUnitId, documentId: w.documentId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!cu) throw new WatchServiceError("WATCH_NOT_FOUND", "content unit not in this document");

    // 중복이면 기존 scope 반환
    const existing = await tx.watchContentScope.findFirst({
      where: { watchId: w.id, contentUnitId: cu.id },
      select: { id: true },
    });
    if (existing) return { scopeId: existing.id };

    try {
      const created = await tx.watchContentScope.create({
        data: {
          workspaceId: w.workspaceId,
          documentId: w.documentId,
          watchId: w.id,
          contentUnitId: cu.id,
        },
        select: { id: true },
      });
      await tx.workspaceAuditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          actorMemberId: ctx.memberId,
          action: "WATCH_SCOPE_ADDED",
          entityType: "WatchContentScope",
          entityId: created.id,
          afterData: { watchId: w.id, contentUnitId: cu.id } as unknown as Prisma.InputJsonValue,
        },
      });
      return { scopeId: created.id };
    } catch (err) {
      // race: 다른 요청이 방금 만들었음
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await tx.watchContentScope.findFirstOrThrow({
          where: { watchId: w.id, contentUnitId: cu.id },
          select: { id: true },
        });
        return { scopeId: winner.id };
      }
      throw err;
    }
  });
}

export async function removeWatchScope(ctx: WatchContext, scopeId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const scope = await tx.watchContentScope.findFirst({
      where: { id: scopeId, workspaceId: ctx.workspaceId },
      select: { id: true, watchId: true, contentUnitId: true },
    });
    if (!scope) throw new WatchServiceError("WATCH_NOT_FOUND", "scope not found");
    await tx.watchContentScope.delete({ where: { id: scope.id } });
    await tx.workspaceAuditLog.create({
      data: {
        workspaceId: ctx.workspaceId,
        actorMemberId: ctx.memberId,
        action: "WATCH_SCOPE_REMOVED",
        entityType: "WatchContentScope",
        entityId: scope.id,
        beforeData: { watchId: scope.watchId, contentUnitId: scope.contentUnitId } as unknown as Prisma.InputJsonValue,
      },
    });
  });
}
