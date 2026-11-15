// Evidence 업로드용 signed URL 발급.
// Body: { taskId, filename }
// Response: { ok, path, signedUrl, token }
//
// 클라이언트는 이 URL 에 PUT 으로 파일을 업로드한 뒤,
// path 를 evidence.fileReference 로 저장 (addEvidenceAction 호출).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createUploadSignedUrl } from "@/lib/storage/supabase-storage";

const bodySchema = z.object({
  taskId: z.string().min(1),
  filename: z.string().min(1).max(255),
});

export async function POST(req: NextRequest) {
  const ctx = await requireUserContext();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "입력 값 오류" }, { status: 400 });

  // Task 소유권 확인 (IDOR 방어)
  const task = await prisma.task.findFirst({
    where: { id: parsed.data.taskId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!task) return NextResponse.json({ ok: false, error: "업무를 찾을 수 없습니다." }, { status: 404 });

  try {
    const result = await createUploadSignedUrl({
      workspaceId: ctx.workspaceId,
      taskId: task.id,
      filename: parsed.data.filename,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[storage/upload-url] failed:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: "스토리지 설정을 확인해주세요. (Supabase 대시보드 → Storage → 'evidence' 버킷 생성)" },
      { status: 500 },
    );
  }
}
