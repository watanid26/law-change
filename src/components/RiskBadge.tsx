// 개정 신호 배지 + 근거.
//
// 화면이 "제26조가 수정됨" 까지만 말하고 "그래서 뭘 해야 하나" 를 안 하던
// 것이 실사용 평가에서 가장 낮은 점수(업무에 도움이 됨 4/10)의 원인이었다.
//
// 등급만 보여주면 그것대로 "왜 높음인지" 를 화면 밖에서 알아내야 한다.
// 컴플라이언스에서는 근거 없는 판정을 쓸 수 없으므로 근거를 항상 같이 낸다.
//
// 사람이 고르는 영향도(impactLevel)와는 다른 축이다. 이건 문서가 말하는
// 것이고 그건 우리 조직 기준의 판단이다. 덮어쓰지 않고 나란히 놓는다.

import { RISK_HINT, RISK_LABEL, type RiskLevel, type RiskVerdict } from "@/lib/risk/changeRisk";
import { cx } from "./ui";

const TONE: Record<RiskLevel, string> = {
  high: "border-danger/30 bg-danger-subtle text-danger",
  medium: "border-warning/30 bg-warning-subtle text-warning",
  low: "border-line bg-subtle text-fg-secondary",
  none: "border-line bg-subtle text-fg-muted",
};

/** 목록 한 줄에 붙는 작은 배지. */
export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  if (level === "none") return null;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
        TONE[level],
        className,
      )}
      title={RISK_HINT[level]}
    >
      {RISK_LABEL[level]}
    </span>
  );
}

/** 상세 화면 상단. 등급 + 왜 그렇게 봤는지. */
export function RiskSummary({
  verdict,
  /** 이 화면에서 사용자가 직접 판단할 수 있는지. 문구가 달라진다. */
  canJudge = false,
}: {
  verdict: RiskVerdict;
  canJudge?: boolean;
}) {
  if (verdict.level === "none") return null;
  return (
    <section
      className={cx("rounded-md border px-4 py-3.5", TONE[verdict.level])}
      aria-label="개정 신호"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-base font-semibold">{RISK_LABEL[verdict.level]}</span>
        <span className="text-sm opacity-90">{RISK_HINT[verdict.level]}</span>
      </div>

      {verdict.reasons.length > 0 ? (
        <ul className="mt-2.5 space-y-1 text-sm">
          {verdict.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span aria-hidden="true" className="select-none opacity-60">
                ·
              </span>
              <span>{r}</span>
            </li>
          ))}
          {verdict.more > 0 ? (
            <li className="pl-4 opacity-75">그 밖에 {verdict.more}건이 더 있습니다</li>
          ) : null}
        </ul>
      ) : null}

      {/* 이 신호가 무엇을 못 하는지 밝힌다. 우리 조직 기준의 판단으로
          오해하면 오히려 위험하다. */}
      <p className="mt-2.5 text-xs opacity-70">
        조문 제목과 개정 종류만 보고 매긴 신호입니다.
        {canJudge
          ? " 우리 조직에 실제로 해당되는지는 아래에서 직접 판단해 주세요."
          : " 우리 조직에 실제로 해당되는지는 아래 조문을 보고 판단하세요."}
      </p>
    </section>
  );
}
