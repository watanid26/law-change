// 라운드 21 P2 / 라운드 24 hardening: 법령 diff DOCX 다운로드.
// GET /api/export/laws/{sourceId}/diff?event={eventId}
//
// 라운드 24 수정 배경: Vercel 프로덕션에서 503 재현 (로컬은 정상 200).
// 원인 후보: 함수 콜드스타트 지연 + docx v9 (~5MB) + Prisma engine 번들 크기.
// 방어책:
//   - 전체 로직 try/catch (getLawDetailForDashboard 도 포함)
//   - Content-Length 명시로 CDN 스트리밍 판정 안정화
//   - maxDuration 30s (Vercel Pro 기준, Hobby 는 무시)
//   - console.error 로 스택까지 남겨 Vercel 로그에서 추적 가능

import { NextResponse } from "next/server";
import { getLawDetailForDashboard } from "@/lib/queries/lawDetail";
import { buildDiffDocx } from "@/lib/export/diffDocx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface RouteContext {
  params: { sourceId: string };
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("event") ?? undefined;

    const law = await getLawDetailForDashboard(params.sourceId, { eventId });
    if (!law) {
      return NextResponse.json({ error: "law not found" }, { status: 404 });
    }

    const buffer = await buildDiffDocx(law);
    // Buffer → Uint8Array — Next Response body 는 Web-standard 타입만 안전.
    // 새 ArrayBuffer 를 만들어 Buffer 의 shared pool 참조를 끊는다 (Vercel edge 스트리밍 안정성).
    const body = new Uint8Array(buffer.byteLength);
    body.set(buffer);

    const now = new Date();
    const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const filename = `${law.name}-diff-${yyyymmdd}.docx`;
    const encoded = encodeURIComponent(filename);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `attachment; filename="diff.docx"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const e = err as Error;
    console.error("[export/diff] failed:", e.name, e.message, e.stack);
    return NextResponse.json(
      {
        error: "export failed",
        message: e.message,
        // 프로덕션에서 스택 노출은 지양. 로그로만.
      },
      { status: 500 },
    );
  }
}
