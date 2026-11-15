// POST /api/watches/[watchId]/review-complete
// 검토 완료 기록. 서버가 lastReviewedAt / nextReviewAt 을 반환해 client 가 즉시 UI 갱신.

import type { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/auth/session";
import { markWatchReviewed, WatchServiceError } from "@/lib/watches/service";
import { errorResponse, okResponse, serverErrorResponse } from "@/lib/api/mutation-response";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { watchId: string } }) {
  const watchId = params.watchId;
  if (!watchId) return errorResponse("BAD_REQUEST", 400);
  try {
    const ctx = await requireUserContext();
    const data = await markWatchReviewed({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, watchId);
    return okResponse(data);
  } catch (err) {
    if (err instanceof WatchServiceError) return errorResponse(err.code, 400);
    return serverErrorResponse(err, "api watches review-complete");
  }
}
