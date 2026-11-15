// POST /api/watches/[watchId]/archive
// 관심 법령 해제 (soft archive). 라운드 7 프리징의 주 대상 액션.

import type { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/auth/session";
import { archiveWatch, WatchServiceError } from "@/lib/watches/service";
import { errorResponse, okResponse, serverErrorResponse } from "@/lib/api/mutation-response";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { watchId: string } }) {
  const watchId = params.watchId;
  if (!watchId) return errorResponse("BAD_REQUEST", 400);
  try {
    const ctx = await requireUserContext();
    await archiveWatch({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, watchId);
    return okResponse({ watchId, status: "ARCHIVED" });
  } catch (err) {
    if (err instanceof WatchServiceError) return errorResponse(err.code, 400);
    return serverErrorResponse(err, "api watches archive");
  }
}
