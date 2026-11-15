// 브랜드 마크 — 3×3 법조문 격자. 일부 셀의 채움이 달라 "변경되는 조문 블록"을
// 표현한다. 법전·저울·법봉 클리셰를 쓰지 않는 이유이기도 하다.
//
// public/brand/lawchange-mark.svg 와 같은 도형을 인라인으로 옮겼다.
// 셸 곳곳에서 렌더되므로 <img> 요청을 만들지 않고, currentColor 로 테마를 따른다.
// 16px 에서도 3×3 격자가 식별되도록 stroke 2 를 유지한다.

import { cx } from "./ui/styles";

export function BrandMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={cx("inline-block shrink-0 align-middle", className)}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth={2} strokeLinejoin="miter">
        <rect x="5" y="5" width="10" height="10" />
        <rect x="19" y="5" width="10" height="10" />
        <rect x="33" y="5" width="10" height="10" />
        <rect x="5" y="19" width="10" height="10" />
        {/* 채워진 가운데 셀 = 지금 보고 있는 조각 */}
        <rect x="19" y="19" width="10" height="10" fill="currentColor" />
        <rect x="33" y="19" width="10" height="10" />
        <rect x="5" y="33" width="10" height="10" />
        <rect x="19" y="33" width="10" height="10" />
        <path d="M33 43V33h10v10H33Z" />
      </g>
      {/* 우하단 셀의 + = 신설되는 조문 */}
      <path d="M36 36h4M38 34v4" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/** 마크 + 워드마크. 사이드바·헤더·랜딩 공용. */
export function BrandLockup({
  className,
  markSize = 22,
}: {
  className?: string;
  markSize?: number;
}) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <BrandMark size={markSize} className="text-primary-text" />
      <span className="text-lg font-semibold tracking-title text-fg">
        LawChange
      </span>
    </span>
  );
}
