// DELETE /api/evidences/[evidenceId]
// 증빙 soft delete. 라운드 6~7 프리징 3번째 케이스.

import type { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/auth/session";
import { softDeleteEvidence } from "@/lib/tasks/service";
import { errorResponse, okResponse, serverErrorResponse } from "@/lib/api/mutation-response";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { evidenceId: string } }) {
  const evidenceId = params.evidenceId;
  if (!evidenceId) return errorResponse("BAD_REQUEST", 400);
  try {
    const ctx = await requireUserContext();
    await softDeleteEvidence({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, evidenceId);
    return okResponse({ evidenceId });
  } catch (err) {
    return serverErrorResponse(err, "api evidence delete");
  }
}
