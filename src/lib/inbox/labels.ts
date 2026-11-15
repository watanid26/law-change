import type { Tone } from "@/components/ui/styles";

// ChangeInboxItem UI 라벨.
// DB enum ↔ 한국어 매핑.

export const INBOX_STATUS_VALUES = [
  "NEW",
  "REVIEWING",
  "ACTION_REQUIRED",
  "MONITORING",
  "DONE",
  "DISMISSED",
] as const;
export type InboxStatus = (typeof INBOX_STATUS_VALUES)[number];

export const INBOX_STATUS_LABEL: Record<InboxStatus, string> = {
  NEW: "신규",
  REVIEWING: "검토 중",
  ACTION_REQUIRED: "조치 필요",
  MONITORING: "모니터링",
  DONE: "완료",
  DISMISSED: "기각",
};

/**
 * 상태 전이 규칙. 서버가 최종 판정을 하지만 화면도 알아야 한다 —
 * 목록의 퀵 액션이 갈 수 없는 상태를 보여주면 누른 뒤에야 거절당한다.
 * 서버(transitionInboxItem)와 이 표가 같은 것을 봐야 하므로 여기 한 곳에 둔다.
 */
export const INBOX_TRANSITIONS: Record<InboxStatus, InboxStatus[]> = {
  NEW: ["REVIEWING", "DISMISSED"],
  REVIEWING: ["ACTION_REQUIRED", "MONITORING", "DONE", "DISMISSED"],
  ACTION_REQUIRED: ["DONE", "DISMISSED", "MONITORING"],
  MONITORING: ["ACTION_REQUIRED", "DONE", "DISMISSED"],
  DONE: ["REVIEWING"],      // 재검토 허용
  DISMISSED: ["REVIEWING"], // 오판 정정 허용
};

// UI 흐름 상 "열려있음" 으로 취급할 상태들 (기본 목록에 표시)
export const INBOX_OPEN_STATUSES: InboxStatus[] = ["NEW", "REVIEWING", "ACTION_REQUIRED", "MONITORING"];
// 완료 처리된 상태들
export const INBOX_CLOSED_STATUSES: InboxStatus[] = ["DONE", "DISMISSED"];

// 제3판: 배지 클래스 문자열 대신 semantic tone 만 노출한다.
// 화면은 <Badge tone={...}> 로 그린다 — 같은 상태가 화면마다 다른 색으로
// 보이던 문제를 여기 한 곳에서 막는다.
// 배지에 마우스를 올렸을 때 뜨는 설명. 상태 이름만으로는 "지금 내가 뭘
// 해야 하는지" 가 안 읽힌다는 지적(사용성 평가)에 대한 대응.
export const INBOX_STATUS_HINT: Record<InboxStatus, string> = {
  NEW: "아직 열어보지 않은 변경입니다.",
  REVIEWING: "열어봤고 판단 중입니다. 상세 화면을 열면 자동으로 이 상태가 됩니다.",
  ACTION_REQUIRED: "우리 조직에 실제로 할 일이 생긴 변경입니다.",
  MONITORING: "지금 조치할 것은 없지만 계속 지켜봐야 하는 변경입니다.",
  DONE: "검토를 마쳤습니다.",
  DISMISSED: "우리와 무관하다고 판단해 종결했습니다.",
};

export const INBOX_STATUS_TONE: Record<InboxStatus, Tone> = {
  NEW: "primary",           // 아직 손대지 않음 — 지금 볼 것
  REVIEWING: "info",        // 진행 중
  ACTION_REQUIRED: "danger",// 조치 필요
  MONITORING: "neutral",    // 지켜보는 중
  DONE: "success",
  DISMISSED: "neutral",
};

// Applicability — Watch 와 같은 enum (사용자가 이 변경 건에 대해 별도 판단 가능)
export const INBOX_APPLICABILITY_VALUES = [
  "UNKNOWN", "APPLICABLE", "NOT_APPLICABLE", "NEEDS_REVIEW",
] as const;
export const INBOX_APPLICABILITY_LABEL: Record<string, string> = {
  UNKNOWN: "미정",
  APPLICABLE: "적용",
  NOT_APPLICABLE: "해당 없음",
  NEEDS_REVIEW: "추가 검토",
};

export const IMPACT_LEVEL_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const IMPACT_LEVEL_LABEL: Record<string, string> = {
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
  CRITICAL: "심각",
};
export const IMPACT_LEVEL_TONE: Record<string, Tone> = {
  LOW: "neutral",
  MEDIUM: "neutral",
  HIGH: "warning",
  CRITICAL: "danger",
};
