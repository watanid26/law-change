// POST /api/watches/register
// body: { documentId: string }
// 관심 법령 신규 등록 (or 재활성화).
// Server Action 대신 API route: HTTP 상태를 명확히 분리 + auto-refresh 회피.

import type { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/auth/session";
import { createOrReactivateWatch, WatchServiceError } from "@/lib/watches/service";
import { errorResponse, okResponse, serverErrorResponse } from "@/lib/api/mutation-response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { documentId?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("BAD_REQUEST", 400);
  }
  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  if (!documentId) return errorResponse("BAD_REQUEST", 400);

  try {
    const ctx = await requireUserContext();
    const { watch } = await createOrReactivateWatch(
      { workspaceId: ctx.workspaceId, memberId: ctx.memberId },
      documentId,
    );
    return okResponse({ watchId: watch.id, status: watch.status });
  } catch (err) {
    if (err instanceof WatchServiceError) return errorResponse(err.code, 400);
    return serverErrorResponse(err, "api watches register");
  }
}
