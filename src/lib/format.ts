// 날짜/시간 표시 헬퍼

// 빈값 글리프는 em dash "—" 로 통일. 이전엔 hyphen "-" 을 혼용해 테이블 안에서
// 담당자 컬럼(em dash)과 날짜 컬럼(hyphen)이 다른 문자를 사용하던 문제(라운드 14 QA).
const EMPTY = "—";

// 이 서비스가 다루는 날짜는 전부 한국 날짜다. 서버가 어느 지역에서 돌든
// "몇 월 며칠" 은 서울 기준으로 읽어야 한다.
//
// 이전에는 UTC 로 읽었다. 공포일·시행일은 DB 에 UTC 자정으로 들어 있어서
// 결과가 같았지만, 감지일(detectedAt)은 실제 시각이라 한국 시간 00~09시에
// 감지된 건이 하루 전 날짜로 표시됐다. 실제로 최근 개정 목록 첫 줄이
// "2026. 8. 26. 감지" 로 나오는데 DB 값은 2026-08-27T00:00:54Z(=한국 8월 27일
// 오전 9시) 였다.
const SEOUL = "Asia/Seoul";

/** 서울 기준 연·월·일. Intl 을 한 번만 통과시키고 숫자로 돌려준다. */
function seoulParts(d: Date): { y: number; m: number; day: number } {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .split("-")
    .map(Number);
  return { y, m, day };
}

export function formatKoreanDate(date: Date | null | undefined): string {
  if (!date) return EMPTY;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return EMPTY;
  const { y, m, day } = seoulParts(d);
  return `${y}. ${m}. ${day}.`;
}

/**
 * "오늘"(서울 기준)의 UTC 자정.
 *
 * new Date() + setHours(0,0,0,0) 은 서버 지역시간을 따른다. Vercel 은 UTC 라
 * 한국시간 00~09시에는 하루 전을 "오늘" 로 잡는다 — 시행 일정의 구간
 * 나누기(지난 30일 / 이번 주 / 그 이후)가 하루 9시간 동안 어긋났다.
 * 저장된 시행일이 UTC 자정이므로 비교 기준도 UTC 자정으로 맞춘다.
 */
export function seoulToday(): Date {
  return new Date(seoulMidnightUtc(new Date()));
}

/** 서울 날짜를 UTC 자정으로 바꾼 값. 날짜끼리 빼기 위한 정규화용. */
function seoulMidnightUtc(d: Date): number {
  const { y, m, day } = seoulParts(d);
  return Date.UTC(y, m - 1, day);
}

// 시행일까지 남은 일수. 오늘(서울) 기준. 이미 지났으면 음수.
// 시행일을 모르는 판이 있다(협정 발효일 조건부 시행 등). 예전에는 0 을
// 돌려줬는데, 0 은 "오늘 시행" 과 구분이 안 돼 미정을 오늘로 표시했다.
// 모르면 모른다고 해야 한다 — null 을 돌려주고 호출부가 다루게 한다.
export function computeDDay(effectiveDate: Date | null | undefined): number | null {
  if (!effectiveDate) return null;
  const target = effectiveDate instanceof Date ? effectiveDate : new Date(effectiveDate);
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = seoulMidnightUtc(target) - seoulMidnightUtc(new Date());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
