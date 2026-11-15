// 접이식 섹션의 머리. <details> 안에서만 쓴다.
//
// 좁은 화면에서 우측 레일(개정 이력·조문 목차)이 이 접이식으로 내려가는데,
// list-none 으로 브라우저 기본 삼각형까지 지워버려서 "개정 이력 9" 라는 글자와
// 숫자만 덩그러니 남았다. 평가에서 세 법령 연속으로 "숫자만 있고 목록이 전혀
// 렌더링되지 않는다" 로 보고됐다 — 접혀 있다는 걸 알 방법이 없었다.
// 이제 셰브런이 붙고, 열리면 돌아간다.

import { Icon } from "../Icon";

export function DisclosureSummary({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-base font-medium text-fg transition-colors duration-swift hover:text-primary-text">
      <Icon
        name="chevron-down"
        size={15}
        aria-hidden="true"
        className="shrink-0 text-fg-muted transition-transform duration-swift group-open:rotate-180"
      />
      {label}
      <span className="tabular text-sm font-normal text-fg-muted">{count}</span>
      <span className="ml-auto text-sm font-normal text-fg-muted group-open:hidden">
        펼치기
      </span>
    </summary>
  );
}
