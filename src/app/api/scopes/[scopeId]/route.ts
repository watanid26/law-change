// DELETE /api/scopes/[scopeId]
// Watch content scope 해제. 라운드 6~7 프리징의 3번째 케이스.

import type { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/auth/session";
import { removeWatchScope } from "@/lib/watches/scopes";
import { WatchServiceError } from "@/lib/watches/service";
import { errorResponse, okResponse, serverErrorResponse } from "@/lib/api/mutation-response";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { scopeId: string } }) {
  const scopeId = params.scopeId;
  if (!scopeId) return errorResponse("BAD_REQUEST", 400);
  try {
    const ctx = await requireUserContext();
    await removeWatchScope({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, scopeId);
    return okResponse({ scopeId });
  } catch (err) {
    if (err instanceof WatchServiceError) return errorResponse(err.code, 400);
    return serverErrorResponse(err, "api scope delete");
  }
}
