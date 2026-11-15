"use server";

// 라운드 28-D: 산업 프리셋 → 한 번에 관심 등록 (bulk watch).
// documentIds 배열을 받아 각각 createOrReactivateWatch. idempotent (이미 있으면 스킵).

import { revalidatePath } from "next/cache";
import { requireUserContext } from "@/lib/auth/session";
import {
  createOrReactivateWatch,
  WatchServiceError,
} from "@/lib/watches/service";

export type BulkWatchResult =
  | { ok: true; created: number; reactivated: number; alreadyActive: number; failed: number }
  | { ok: false; error: string };

export async function bulkWatchAction(documentIds: string[]): Promise<BulkWatchResult> {
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return { ok: false, error: "선택된 법령이 없습니다." };
  }
  if (documentIds.length > 100) {
    return { ok: false, error: "한 번에 최대 100개까지 등록할 수 있습니다." };
  }
  try {
    const ctx = await requireUserContext();
    let created = 0;
    let reactivated = 0;
    let alreadyActive = 0;
    let failed = 0;

    for (const documentId of documentIds) {
      try {
        const result = await createOrReactivateWatch(
          { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
          documentId,
        );
        if (result.outcome === "CREATED") created++;
        else if (result.outcome === "REACTIVATED") reactivated++;
        else alreadyActive++;
      } catch (err) {
        if (err instanceof WatchServiceError && err.code === "DOCUMENT_NOT_FOUND") {
          failed++;
          continue;
        }
        throw err;
      }
    }

    revalidatePath("/app/watches");
    revalidatePath("/app");
    return { ok: true, created, reactivated, alreadyActive, failed };
  } catch (err) {
    console.error("[bulk-watch] failed:", (err as Error).message);
    return { ok: false, error: "관심 등록 처리 중 오류가 발생했습니다." };
  }
}
