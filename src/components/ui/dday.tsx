// 시행일까지 남은 날. 앱 전체에서 이 컴포넌트 하나로만 그린다.
//
// 원래도 색 구간(≤7 danger · ≤14 warning)은 있었다. 그런데 평가에서
// "D-13이든 D-33이든 동일한 검정 계열" 로 읽혔다 — 관찰이 정직하다.
// warning 토큰 #7A5200 은 어두운 갈색이라 12~14px 에서 본문 검정과 거의
// 구분되지 않는다. 대비를 지키려고 어둡게 잡은 값이 급박함을 못 나른 것이다.
//
// 색을 더 밝게 하면 대비가 깨진다. 그래서 색 대신 **형태**를 쓴다 — 4가지
// 변경 유형에서 이미 쓴 방법이다.
//   D-7 이하   채운 배지    (한 화면에서 즉시 눈에 띈다)
//   D-14 이하  테두리 배지
//   D-30 이하  글자만, 경고색
//   그 외      조용한 글자
//   지난 것    "시행 완료"
//
// 구간을 늘리지 않았다. 급한 것이 많아 보이면 급한 것이 안 보인다.

import { computeDDay, formatKoreanDate } from "@/lib/format";
import { cx } from "./styles";

export type DDayTier = "past" | "today" | "urgent" | "soon" | "near" | "far";

export function ddayTier(d: number | null): DDayTier {
  if (d === null) return "far";
  if (d < 0) return "past";
  if (d === 0) return "today";
  if (d <= 7) return "urgent";
  if (d <= 14) return "soon";
  if (d <= 30) return "near";
  return "far";
}

const SHELL: Record<DDayTier, string> = {
  // 채운 면 — 목록을 훑을 때 여기서 눈이 멈춘다.
  today: "bg-danger px-2 py-0.5 rounded-sm text-[rgb(var(--surface))]",
  urgent: "bg-danger px-2 py-0.5 rounded-sm text-[rgb(var(--surface))]",
  // 테두리 — 있다는 건 알리되 소리치지 않는다.
  soon: "border border-warning px-2 py-0.5 rounded-sm text-warning",
  near: "text-warning",
  far: "text-fg-secondary",
  past: "text-fg-muted",
};

export function DDay({
  date,
  className,
}: {
  date: Date | string | null | undefined;
  className?: string;
}) {
  if (!date) {
    return <span className={cx("text-sm text-fg-disabled", className)}>시행일 미정</span>;
  }
  const d = computeDDay(date instanceof Date ? date : new Date(date));
  const tier = ddayTier(d);
  const label =
    tier === "past"
      ? "시행 완료"
      : tier === "today"
        ? "오늘 시행"
        : `시행 D-${d}`;

  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap text-sm font-medium tabular",
        SHELL[tier],
        className,
      )}
      title={`${formatKoreanDate(date instanceof Date ? date : new Date(date))} 시행`}
    >
      {label}
    </span>
  );
}
