// 라운드 17 T6: 데이터가 언제 것인지 명시하는 공통 신뢰 시그널.
// 심사평 "2026. 8. 20. 기준"이 신뢰 정보(동기화 시각)로 오인될 위계 → 절대시각 노출로 대체.
// - kind="synced": 실제 데이터 소스 동기화 시각. 백엔드가 값을 넘길 때만 사용.
//
// "이 화면 기준"(렌더 시각) 종류가 있었으나 제거했다. 그건 "지금"이라는 뜻일
// 뿐 데이터가 언제 것인지는 말해주지 않아 디버그 잔재로 읽혔다(사용성 평가).
// 동기화 시각을 모르면 아무것도 보여주지 않는 쪽이 정직하다.

type LastSyncedKind = "synced";

interface Props {
  at: Date | string | number;
  kind?: LastSyncedKind;
  className?: string;
}

// "표시 시각" 은 사용자에게 아무 의미가 없어 디버그 잔재로 읽혔다
// (사용성 평가). 실제 가치는 "이 목록이 언제 것인가" 하나뿐이므로
// 수집기 동기화 시각에만 쓰고 문구도 그것을 말한다.
const LABELS: Record<LastSyncedKind, string> = {
  synced: "법령 갱신",
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// 서버 컴포넌트에서 렌더되므로 서버 지역시간(Vercel = UTC)으로 찍힌다.
// 한국 사용자에게 9시간 전 시각이 "법령 갱신" 으로 보였다. 서울 기준 고정.
function formatKoreanDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}.${Number(get("month"))}.${Number(get("day"))} ${pad(Number(get("hour")))}:${pad(Number(get("minute")))}`;
}

export function LastSyncedAt({ at, kind = "synced", className }: Props) {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs text-fg-secondary ${className ?? ""}`}
      >
        데이터 갱신 시각 정보 없음
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-fg-secondary ${className ?? ""}`}
      title={`${LABELS[kind]} · ${d.toISOString()}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
      />
      {LABELS[kind]} {formatKoreanDateTime(d)}
    </span>
  );
}
