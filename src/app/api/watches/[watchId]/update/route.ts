// POST /api/watches/[watchId]/update
// 판단 사유·중요도·담당자·주기·알림 저장. 라운드 7 저장 503 의 주 대상.

import type { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/auth/session";
import { updateWatch, WatchServiceError } from "@/lib/watches/service";
import { updateWatchInput } from "@/lib/watches/validation";
import { errorResponse, okResponse, serverErrorResponse } from "@/lib/api/mutation-response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { watchId: string } }) {
  const watchId = params.watchId;
  if (!watchId) return errorResponse("BAD_REQUEST", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("BAD_REQUEST", 400);
  }
  const parsed = updateWatchInput.safeParse(body);
  if (!parsed.success) return errorResponse("INVALID_INPUT", 400);

  try {
    const ctx = await requireUserContext();
    await updateWatch({ workspaceId: ctx.workspaceId, memberId: ctx.memberId }, watchId, parsed.data);
    return okResponse({ watchId });
  } catch (err) {
    if (err instanceof WatchServiceError) return errorResponse(err.code, 400);
    return serverErrorResponse(err, "api watches update");
  }
}
