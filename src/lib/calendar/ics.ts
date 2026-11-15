// ICS(iCalendar) 피드 생성.
//
// 왜 만들었나: 앱 안의 월 그리드는 법무 담당자가 매일 여는 화면이 되지 못한다.
// 시행일은 이미 쓰고 있는 캘린더(구글·아웃룩)에 꽂혀 있어야 쓸모가 있다.
// 구독 URL 하나를 등록해 두면 관심 법령의 시행일과 검토 예정일이 자동으로
// 들어가고, 관심을 해제하면 사라진다. 팀 공용 캘린더에 걸면 공유도 따라온다.
//
// "인앱은 지원하지 않는다"는 방향과 같은 결이다 — 알림은 메일로, 일정은
// 사용자의 캘린더로 나간다.

import type { CalendarEvent } from "./queries";

/** RFC 5545 escaping. 쉼표·세미콜론·역슬래시·개행. */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 종일 일정용 날짜 (YYYYMMDD).
 *
 * 서버 지역시간으로 읽으면 배포 지역에 따라 하루가 밀린다. 이 서비스가
 * 다루는 날짜는 전부 한국 날짜이므로 서울 기준으로 고정한다.
 */
function dateOnly(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/-/g, "");
}

/** UTC 타임스탬프 (YYYYMMDDTHHMMSSZ). DTSTAMP 용. */
function stamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** 75옥텟 초과 줄은 접어야 한다 (RFC 5545 3.1). 한글은 UTF-8 3바이트. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 74) return line;
  const out: string[] = [];
  let cur = Buffer.alloc(0);
  for (const ch of line) {
    const b = Buffer.from(ch, "utf8");
    // 이어지는 줄은 앞에 공백 1칸이 붙으므로 여유를 둔다.
    if (cur.length + b.length > 73) {
      out.push(cur.toString("utf8"));
      cur = Buffer.alloc(0);
    }
    cur = Buffer.concat([cur, b]);
  }
  if (cur.length) out.push(cur.toString("utf8"));
  return out.join("\r\n ");
}

const KIND_PREFIX: Record<CalendarEvent["kind"], string> = {
  EFFECTIVE: "시행",
  REVIEW: "검토 예정",
  TASK: "업무 마감",
};

export interface IcsOptions {
  /** 캘린더 앱에 표시될 이름. */
  calendarName: string;
  /** 링크를 절대 URL 로 만들기 위한 사이트 주소. */
  baseUrl: string;
  /** UID 안정성을 위한 워크스페이스 식별자. */
  workspaceId: string;
}

/**
 * 이벤트 목록을 ICS 문서로. 전부 종일(all-day) 일정이다 —
 * 시행일·검토일에 시각 개념이 없기 때문.
 */
export function buildIcs(events: CalendarEvent[], opts: IcsOptions): string {
  const now = new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LawChange//KR//",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.calendarName)}`,
    "X-WR-TIMEZONE:Asia/Seoul",
    // 구독 클라이언트에 갱신 주기를 알린다 (표준 X- 확장).
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  for (const e of events) {
    const start = dateOnly(e.date);
    const endDate = new Date(e.date);
    endDate.setDate(endDate.getDate() + 1); // DTEND 는 exclusive
    // UID 는 안정적이어야 한다. 같은 일정이 매번 새 UID 를 받으면
    // 캘린더에 중복이 쌓인다.
    const uid = `${opts.workspaceId}-${e.kind}-${start}-${Buffer.from(e.href).toString("base64url")}@lawchange`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${dateOnly(endDate)}`,
      fold(`SUMMARY:[${KIND_PREFIX[e.kind]}] ${esc(e.title)}`),
      fold(`URL:${opts.baseUrl}${e.href}`),
      fold(
        `DESCRIPTION:${esc(
          `${KIND_PREFIX[e.kind]}${e.meta ? ` · ${e.meta}` : ""}\n${opts.baseUrl}${e.href}`,
        )}`,
      ),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 는 CRLF 를 요구한다.
  return lines.join("\r\n") + "\r\n";
}
