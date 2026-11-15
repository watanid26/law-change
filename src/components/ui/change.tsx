// 4 변경타입 표현 — 색만으로 구분하지 않는다.
//
// C안 §8: 색 + 기호 + 형태 단서 중 최소 두 가지를 항상 함께 쓴다.
// 색약자·흑백 인쇄·저대비 화면에서도 네 종류가 구분돼야 한다.
//
//   신설 +   테두리 사각 + 채운 좌측 바
//   수정 ~   테두리 사각 + 위아래 실선 규칙
//   삭제 −   테두리 사각 + 취소선
//   이동 ↔   테두리 사각 + 점선 좌측 바
//
// 글리프 자체는 public/icons/change/*.svg 와 같은 형태 언어(사각 프레임 + 기호)를
// 인라인 SVG 로 옮긴 것이다. 목록 안에서 수백 번 렌더되므로 <img> 요청 대신
// 인라인으로 두고, currentColor 로 테마를 따라간다.

import type { ChangeType } from "@/lib/types";
import { cx } from "./styles";

export const CHANGE_LABEL: Record<ChangeType, string> = {
  added: "신설",
  modified: "수정",
  deleted: "삭제",
  moved: "이동",
};

/** 색을 못 쓰는 맥락(흑백·스크린리더)에서도 타입을 전달하는 기호. */
export const CHANGE_SYMBOL: Record<ChangeType, string> = {
  added: "+",
  modified: "~",
  deleted: "−",
  moved: "↔",
};

/** 글자색. panel 배경 위에서 AA 를 만족하는 값. */
export const CHANGE_TEXT: Record<ChangeType, string> = {
  added: "text-change-addedText",
  modified: "text-change-modifiedText",
  deleted: "text-change-deletedText",
  moved: "text-change-movedText",
};

/** 블록 배경. */
export const CHANGE_PANEL: Record<ChangeType, string> = {
  added: "bg-change-addedPanel",
  modified: "bg-change-modifiedPanel",
  deleted: "bg-change-deletedPanel",
  moved: "bg-change-movedPanel",
};

/**
 * 조문 블록의 좌측 형태 단서. 타입마다 굵기·선종류가 다르다.
 * 색이 안 보여도 실선/점선/두께로 구분된다.
 */
export const CHANGE_EDGE: Record<ChangeType, string> = {
  added: "border-l-[3px] border-l-change-addedMark",
  modified: "border-l-[3px] border-l-change-modifiedMark",
  // 삭제는 얇은 선 — 죽은 조문이라는 시각적 무게를 낮춘다.
  deleted: "border-l border-l-change-deletedMark",
  // 이동은 점선 — 자리를 옮겼다는 뜻을 선 자체가 말한다.
  moved: "border-l-[3px] border-dashed border-l-change-movedMark",
};

const PATHS: Record<ChangeType, React.ReactNode> = {
  added: <path d="M12 7v10M7 12h10" strokeWidth={2} />,
  modified: <path d="M6.5 13c2-4 4 4 6 0s4 4 5-1" strokeWidth={2} />,
  deleted: <path d="M7 12h10" strokeWidth={2} />,
  moved: (
    <path
      d="M6 12h12M8.5 9.5 6 12l2.5 2.5M15.5 9.5 18 12l-2.5 2.5"
      strokeWidth={1.8}
    />
  ),
};

/** 사각 프레임 + 기호. 브랜드 마크(3×3 격자)와 같은 형태 언어. */
export function ChangeGlyph({
  type,
  size = 16,
  className,
}: {
  type: ChangeType;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="square"
      className={cx("inline-block shrink-0 align-middle", className)}
      aria-hidden="true"
    >
      {/* 프레임 자체도 타입마다 다르게. 색을 못 보는 상황에서 기호 하나에만
          의존하지 않도록, 선 굵기·선종류로 한 겹 더 구분한다.
            신설 굵은 실선 / 수정 실선 / 삭제 점선 / 이동 파선 */}
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        strokeWidth={type === "added" ? 2 : 1.2}
        strokeDasharray={
          type === "moved" ? "3 2" : type === "deleted" ? "1.5 2" : undefined
        }
      />
      {PATHS[type]}
    </svg>
  );
}

/**
 * 변경타입 배지. 글리프 + 낱말을 항상 함께 낸다.
 * pill 이 아니라 각진 블록 — 조각 시스템의 형태 언어.
 */
export function ChangeBadge({
  type,
  label,
  className,
}: {
  type: ChangeType;
  /** 기본 낱말 대신 쓸 문구 (예: "이동 + 본문 변경"). */
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium",
        CHANGE_PANEL[type],
        CHANGE_TEXT[type],
        className,
      )}
    >
      <ChangeGlyph type={type} size={13} />
      {label ?? CHANGE_LABEL[type]}
    </span>
  );
}

/**
 * 목록 행에 붙는 아주 작은 마커. 어떤 타입이 몇 건인지 한 줄로.
 * 카운트가 0인 타입은 그리지 않는다.
 */
export function ChangeMarkers({
  counts,
  className,
}: {
  counts: Partial<Record<ChangeType, number>>;
  className?: string;
}) {
  const entries = (Object.keys(CHANGE_LABEL) as ChangeType[]).filter(
    (t) => (counts[t] ?? 0) > 0,
  );
  if (entries.length === 0) return null;
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      {entries.map((t) => (
        <span
          key={t}
          className={cx("inline-flex items-center gap-1 text-xs tabular", CHANGE_TEXT[t])}
          title={`${CHANGE_LABEL[t]} ${counts[t]}건`}
        >
          <ChangeGlyph type={t} size={12} />
          {/* title 툴팁은 터치 기기에서 아예 안 뜨고 스크린리더도 잘 안 읽는다.
              기호 뜻은 글자로도 항상 나와야 한다 — 좁은 화면에선 sr-only 로,
              자리가 있으면 눈에 보이게. */}
          <span className="sr-only sm:not-sr-only">{CHANGE_LABEL[t]}</span>
          {counts[t]}
        </span>
      ))}
    </span>
  );
}
