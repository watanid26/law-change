// 디자인 규정집 제2판 — 스타일 매핑 헬퍼.
// v2 원칙: 배지는 색+기호+낱말을 함께. 상태는 행 전체 톤으로. 테라코타는 한 화면에 하나.

import type { ChangeType, ReviewStatus } from "./types";

// 4 변경타입 배지 — 기호(+, ~, -, ↔)와 낱말을 항상 함께.
export const changeSymbol: Record<ChangeType, string> = {
  added: "＋",
  modified: "～",
  deleted: "－",
  moved: "↔",
};

export const changeLabel: Record<ChangeType, string> = {
  added: "신설",
  modified: "수정",
  deleted: "삭제",
  moved: "이동",
};

// ChangeEvent.eventType (DB enum) 한글 라벨.
// 라운드 31 감사 지적: 인박스 목록·상세, 워치 상세 변경 이력에서 "REVISION" 이
// 영어 대문자 그대로 노출됐다. 나머지 UI 가 전부 한국어라 이 라벨만 튀었다.
// DB 값: FIRST_ISSUE | REVISION | REPEAL | CORRECTION | TITLE_CHANGE
const EVENT_TYPE_LABEL: Record<string, string> = {
  FIRST_ISSUE: "제정",
  REVISION: "개정",
  REPEAL: "폐지",
  CORRECTION: "정정",
  TITLE_CHANGE: "제명 변경",
};

/** 알 수 없는 값은 원문 그대로 반환 (수집기가 새 타입을 뱉어도 화면이 비지 않게). */
export function eventTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return EVENT_TYPE_LABEL[raw] ?? raw;
}

// 배지 자체 스타일 — 조문 옆에 붙는 작은 라벨.
export const changeBadgeCls: Record<ChangeType, string> = {
  added: "border border-change-addedMark bg-change-addedPanel text-success",
  modified: "border border-change-modifiedMark bg-change-modifiedPanel text-warning",
  deleted: "border border-line-strong bg-subtle text-fg-muted",
  moved: "border border-dashed border-change-movedMark bg-change-movedPanel text-info",
};

// 조문 인용 패널(우측 "현재") 스타일 — 왼쪽 3px 색 띠 + 살짝 다른 배경.
export const changePanelCls: Record<ChangeType, string> = {
  added: "border-l-[3px] border-change-addedMark bg-change-addedPanel",
  modified: "border-l-[3px] border-change-modifiedMark bg-change-modifiedPanel",
  deleted: "border-l-[3px] border-line-strong bg-subtle",
  moved: "border-l-[3px] border-dashed border-change-movedMark bg-change-movedPanel",
};

// 5 상태 — 위에 있을수록 강함. 순서 바꾸지 않음.
export type LawState = "imminent" | "detected" | "current" | "review_needed" | "reviewed";

// UI 리뷰상태 → 5상태 매핑 (D-day 정보와 함께 판단).
export function resolveLawState(status: ReviewStatus, dDay: number): LawState {
  // 시행이 7일 이내로 임박(양수 0~7)했으면 임박이 우선.
  if (dDay >= 0 && dDay <= 7) return "imminent";
  if (status === "unchecked") return "detected";
  if (status === "review_needed") return "review_needed";
  if (status === "in_progress") return "review_needed";
  if (status === "checked" || status === "done" || status === "not_applicable") return "reviewed";
  return "current";
}

export const stateLabel: Record<LawState, string> = {
  imminent: "！시행 임박",
  detected: "＋ 변경 감지",
  current: "· 현재 시행 중",
  review_needed: "？ 검토 필요",
  reviewed: "✓ 검토 완료",
};

// 상태 배지 — 배지 하나짜리, 목록 행이나 상세 페이지 헤더에서 사용.
export const stateBadgeCls: Record<LawState, string> = {
  imminent: "bg-danger-subtle text-danger font-semibold",
  detected: "border border-primary bg-change-addedPanel text-primary-text font-semibold",
  current: "text-fg font-semibold",
  review_needed: "border border-line-strong bg-subtle text-fg-secondary font-semibold",
  reviewed: "border border-line-strong bg-selected text-primary-text font-semibold",
};

// 목록 행 배경 — 상태를 행 전체에 얹을 때. 임박은 테라코타 전면.
export const stateRowCls: Record<LawState, string> = {
  imminent: "bg-danger text-primary-fg",
  detected: "bg-selected border-l-4 border-primary",
  current: "bg-surface",
  review_needed: "bg-subtle border-l-4 border-line",
  reviewed: "bg-surface opacity-90",
};

// D-day 문자열 포맷터.
export function formatDDay(dDay: number): string {
  if (dDay === 0) return "당일";
  if (dDay > 0) return `${dDay}일 뒤`;
  return `${Math.abs(dDay)}일 지남`;
}
