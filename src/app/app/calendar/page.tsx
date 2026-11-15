// 시행 일정 — 월 그리드를 버리고 타임라인 + 캘린더 구독으로 다시 만들었다.
//
// 왜: 법무 담당자가 매일 여는 화면은 캘린더가 아니다. 월 그리드는 "이번 달에
// 뭐가 있나"는 보여주지만 "언제까지 뭘 해야 하나"는 못 보여준다. 게다가 법령
// 시행일은 1월 1일·7월 1일에 몰리는 패턴이 있는데 월 단위로 자르면 그게 안 보인다.
//
// 대신:
//   1) 구독(ICS) — 사용자가 이미 쓰는 구글/아웃룩 캘린더에 자동으로 꽂는다.
//      앱을 열 필요가 없어지는 게 핵심이다.
//   2) 타임라인 — 앱 안에서는 오늘 기준 가까운 순으로 한 줄씩. 구간으로 묶어
//      "이번 주 / 이번 달 / 다음 달 / 그 이후" 를 한눈에 본다.
//
// 라우트(/app/calendar)와 데이터 소스(listCalendarEvents)는 그대로다.

import Link from "next/link";
import { requireUserContext } from "@/lib/auth/session";
import { formatKoreanDate, computeDDay } from "@/lib/format";
import { listCalendarEvents, type CalendarEvent } from "@/lib/calendar/queries";
import { createCalendarToken } from "@/lib/calendar/token";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import {
  EmptyState,
  PageHeader,
  Panel,
  SectionHeader,
  cx,
} from "@/components/ui";
import { siteUrl } from "@/lib/site-url";
import { seoulToday } from "@/lib/format";

export const dynamic = "force-dynamic";

// 과거는 짧게(놓친 것 확인용), 미래는 길게.
const PAST_DAYS = 30;
const FUTURE_MONTHS = 18;

type BucketKey = "past" | "week" | "month" | "next" | "later";

const BUCKET_LABEL: Record<BucketKey, string> = {
  past: "지난 30일",
  week: "이번 주",
  month: "이번 달",
  next: "다음 달",
  later: "그 이후",
};

export default async function CalendarPage() {
  const ctx = await requireUserContext();

  // 서버 지역시간(UTC)으로 "오늘" 을 잡으면 한국시간 00~09시에 하루 전이
  // 오늘이 된다. 구간 나누기가 하루 9시간 동안 어긋났다.
  const today = seoulToday();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - PAST_DAYS);
  const to = new Date(today);
  to.setUTCMonth(to.getUTCMonth() + FUTURE_MONTHS);

  const events = await listCalendarEvents({ workspaceId: ctx.workspaceId, from, to });
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const token = createCalendarToken(ctx.workspaceId);
  const baseUrl = siteUrl() ?? "";
  const feedUrl = token ? `${baseUrl}/api/calendar/${token}.ics` : null;

  const buckets = groupByBucket(events, today);
  const upcomingCount = events.filter((e) => e.date >= today).length;

  return (
    <>
      <PageHeader
        title="시행 일정"
        description="법령 시행일과 검토 예정일을 가까운 순으로 확인합니다."
        meta={`예정 ${upcomingCount.toLocaleString("ko-KR")}건`}
      />

      {feedUrl ? (
        <CalendarSubscribe url={feedUrl} />
      ) : (
        <Panel className="px-4 py-3 text-sm text-fg-secondary">
          캘린더 구독은 서버에 <code className="text-fg">CALENDAR_TOKEN_SECRET</code>
          {" "}환경변수가 설정되어야 사용할 수 있습니다.
        </Panel>
      )}

      <div className="mt-8 space-y-8">
        {events.length === 0 ? (
          <Panel>
            <EmptyState
              icon="calendar"
              title="예정된 일정이 없습니다"
              description="관심 법령을 등록하면 시행일과 검토 예정일이 여기에 모입니다."
            />
          </Panel>
        ) : (
          (Object.keys(BUCKET_LABEL) as BucketKey[]).map((key) => {
            const list = buckets[key];
            if (!list || list.length === 0) return null;
            return (
              <section key={key}>
                <SectionHeader
                  title={BUCKET_LABEL[key]}
                  description={`${list.length}건`}
                />
                <Panel className="divide-y divide-line overflow-hidden">
                  {list.map((e, i) => (
                    <EventRow key={`${key}-${i}`} event={e} today={today} />
                  ))}
                </Panel>
              </section>
            );
          })
        )}
      </div>

      <p className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-secondary">
        <Legend kind="EFFECTIVE" label="법령 시행" />
        <Legend kind="REVIEW" label="검토 예정" />
        <Legend kind="TASK" label="업무 마감" />
      </p>
    </>
  );
}

function EventRow({ event, today }: { event: CalendarEvent; today: Date }) {
  const dday = computeDDay(event.date);
  const past = event.date < today;
  return (
    <Link
      href={event.href}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-swift hover:bg-hover sm:px-5"
    >
      <span className={cx("shrink-0", dotClass(event.kind))} aria-hidden="true" />
      <span className="w-24 shrink-0 text-sm tabular text-fg-secondary">
        {formatKoreanDate(event.date)}
      </span>
      <span className="min-w-0 flex-1 truncate text-base text-fg">
        {event.title}
      </span>
      {event.meta ? (
        <span className="hidden shrink-0 text-xs text-fg-muted sm:inline">
          {event.meta}
        </span>
      ) : null}
      <span
        className={cx(
          "w-16 shrink-0 text-right text-sm font-medium tabular",
          dday === null
            ? "text-fg-disabled"
            : past
              ? "text-fg-muted"
              : dday <= 7
                ? "text-danger"
                : dday <= 14
                  ? "text-warning"
                  : "text-fg-secondary",
        )}
      >
        {dday === null ? "미정" : past ? `${-dday}일 전` : dday === 0 ? "오늘" : `D-${dday}`}
      </span>
    </Link>
  );
}

/** 오늘 기준 구간으로 분류. 경계는 "이번 주 일요일"이 아니라 오늘+7일 기준. */
function groupByBucket(
  events: CalendarEvent[],
  today: Date,
): Partial<Record<BucketKey, CalendarEvent[]>> {
  // today 는 서울 기준 자정을 UTC 로 정규화한 값이다. 여기서도 UTC 계열로
  // 다뤄야 경계가 흔들리지 않는다.
  const week = new Date(today);
  week.setUTCDate(week.getUTCDate() + 7);
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const nextMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 1));

  const out: Partial<Record<BucketKey, CalendarEvent[]>> = {};
  const push = (k: BucketKey, e: CalendarEvent) => {
    (out[k] ??= []).push(e);
  };

  for (const e of events) {
    if (e.date < today) push("past", e);
    else if (e.date < week) push("week", e);
    else if (e.date < monthEnd) push("month", e);
    else if (e.date < nextMonthEnd) push("next", e);
    else push("later", e);
  }
  // 지난 일정은 최근 것부터.
  out.past?.reverse();
  return out;
}

function Legend({
  kind,
  label,
}: {
  kind: CalendarEvent["kind"];
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={dotClass(kind)} />
      {label}
    </span>
  );
}

// 색 + 모양 이중 인코딩. 색약자·흑백 인쇄에서도 3종이 구분된다.
function dotClass(kind: CalendarEvent["kind"]): string {
  switch (kind) {
    case "REVIEW":
      return "inline-block h-2 w-2 rounded-full bg-primary";
    case "EFFECTIVE":
      return "inline-block h-2 w-2 bg-danger";
    case "TASK":
      return "inline-block h-2 w-2 rotate-45 bg-warning";
  }
}
