// "N개 조항 변경" 을 언제 그렇게 부르면 안 되는가.
//
// 최초 수집(FIRST_ISSUE, 이전 판 없음) 이벤트는 비교 대상이 없어서 diff 가
// 만들어지지 않는다. 그런데 totalDiffCount 에는 조문 수가 들어가 있어서
// 목록이 "제정 · 12개 조항 변경" 이라고 말하고, 눌러 들어가면 변경 카드가
// 하나도 없다. 실측 15,402건(전체 이벤트의 13.7% · 행정규칙은 94%)이
// 이 상태였다.
//
// 최초 수집은 "변경" 이 아니라 "조문 N개" 다. 말을 바꾼다.

export interface ChangeSummaryInput {
  eventType: string;
  totalDiffCount: number;
  /** 이전 판이 있는지. 없으면 비교할 대상이 없다는 뜻. */
  hasPrevious: boolean;
}

/**
 * 목록 한 줄에 붙는 변경 요약.
 * 예) "12개 조항 변경" · "조문 12개" · "본문 변경 없음"
 */
export function changeSummaryLabel({
  eventType,
  totalDiffCount,
  hasPrevious,
}: ChangeSummaryInput): string {
  const isFirst = eventType === "FIRST_ISSUE" && !hasPrevious;
  if (isFirst) {
    return totalDiffCount > 0 ? `조문 ${totalDiffCount}개` : "조문 정보 없음";
  }
  return totalDiffCount > 0 ? `${totalDiffCount}개 조항 변경` : "본문 변경 없음";
}

/** 이 이벤트로 들어갔을 때 볼 변경 카드가 있는가. 없으면 전문으로 보낸다. */
export function hasComparableChanges(input: ChangeSummaryInput): boolean {
  return !(input.eventType === "FIRST_ISSUE" && !input.hasPrevious);
}
