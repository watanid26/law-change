// 캘린더 구독 피드 (ICS).
//
// 구글 캘린더 "URL로 추가", 아웃룩 "인터넷 캘린더 구독"에 이 URL 을 넣으면
// 관심 법령의 시행일·검토 예정일·업무 마감이 자동으로 들어온다.
//
// 인증은 URL 토큰(HMAC)으로 한다 — 캘린더 앱은 쿠키를 보내지 않는다.
// 그래서 미들웨어 matcher 에도 이 경로를 넣지 않는다.

import { NextResponse } from "next/server";
import { listCalendarEvents } from "@/lib/calendar/queries";
import { buildIcs } from "@/lib/calendar/ics";
import { verifyCalendarToken } from "@/lib/calendar/token";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

// 과거 6개월 ~ 미래 24개월. 시행일은 몇 년 뒤로도 잡히므로 미래를 넉넉히 잡는다.
const PAST_MONTHS = 6;
const FUTURE_MONTHS = 24;

export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  // .ics 확장자를 붙여 구독하는 클라이언트가 많아 허용한다.
  const raw = params.token.replace(/\.ics$/i, "");
  const workspaceId = verifyCalendarToken(raw);
  if (!workspaceId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  if (!ws) return new NextResponse("Not found", { status: 404 });

  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - PAST_MONTHS);
  const to = new Date(now);
  to.setMonth(to.getMonth() + FUTURE_MONTHS);

  const events = await listCalendarEvents({ workspaceId, from, to });

  const baseUrl = siteUrl() ?? "";

  const ics = buildIcs(events, {
    calendarName: `LawChange · ${ws.name}`,
    baseUrl,
    workspaceId,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="lawchange.ics"',
      // 캘린더 앱이 과하게 자주 긁지 않도록. 구독은 보통 수 시간 간격이다.
      "Cache-Control": "private, max-age=1800",
    },
  });
}
