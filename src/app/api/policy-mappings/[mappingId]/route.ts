// DELETE /api/policy-mappings/[mappingId]
// 사규 ↔ 관심 법령 연결 해제.

import type { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/auth/session";
import { removeMapping } from "@/lib/policies/service";
import { errorResponse, okResponse, serverErrorResponse } from "@/lib/api/mutation-response";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { mappingId: string } }) {
  const mappingId = params.mappingId;
  if (!mappingId) return errorResponse("BAD_REQUEST", 400);
  try {
    const ctx = await requireUserContext();
    await removeMapping({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, mappingId);
    return okResponse({ mappingId });
  } catch (err) {
    return serverErrorResponse(err, "api mapping delete");
  }
}
