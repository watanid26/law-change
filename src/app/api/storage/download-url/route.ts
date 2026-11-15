// Evidence 다운로드 signed URL 발급.
// Query: ?evidenceId=<id>
// 반환: { ok, url } — 60초짜리 signed URL.

import { NextResponse, type NextRequest } from "next/server";
import { requireUserContext } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createDownloadSignedUrl } from "@/lib/storage/supabase-storage";

export async function GET(req: NextRequest) {
  const ctx = await requireUserContext();
  const url = new URL(req.url);
  const evidenceId = url.searchParams.get("evidenceId");
  if (!evidenceId) return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });

  const ev = await prisma.evidence.findFirst({
    where: { id: evidenceId, workspaceId: ctx.workspaceId, deletedAt: null },
    select: { id: true, fileReference: true },
  });
  if (!ev) return NextResponse.json({ ok: false, error: "증빙을 찾을 수 없습니다." }, { status: 404 });
  if (!ev.fileReference) {
    return NextResponse.json({ ok: false, error: "이 증빙에 첨부된 파일이 없습니다." }, { status: 400 });
  }

  try {
    const signed = await createDownloadSignedUrl(ev.fileReference);
    return NextResponse.json({ ok: true, url: signed });
  } catch (err) {
    console.error("[storage/download-url] failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "파일을 열 수 없습니다." }, { status: 500 });
  }
}
