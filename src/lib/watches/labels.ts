import type { Tone } from "@/components/ui/styles";

// Watch / 관심 법령 UI 한국어 라벨 + DB enum ↔ UI mapping.
// DB 는 영어 상수, UI 는 한국어. 매핑을 한 곳에서 관리.

export const APPLICABILITY_LABEL: Record<string, string> = {
  UNKNOWN: "미정",
  APPLICABLE: "적용",
  NOT_APPLICABLE: "해당 없음",
  NEEDS_REVIEW: "추가 검토",
};
export const APPLICABILITY_VALUES = ["UNKNOWN", "APPLICABLE", "NOT_APPLICABLE", "NEEDS_REVIEW"] as const;
export type ApplicabilityStatus = (typeof APPLICABILITY_VALUES)[number];

export const IMPORTANCE_LABEL: Record<string, string> = {
  LOW: "낮음",
  NORMAL: "보통",
  HIGH: "높음",
  URGENT: "긴급",
};
export const IMPORTANCE_VALUES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type Importance = (typeof IMPORTANCE_VALUES)[number];

export const REVIEW_FREQUENCY_LABEL: Record<string, string> = {
  "0": "없음",
  "1": "매월",
  "3": "분기",
  "6": "반기",
  "12": "연간",
};
// months 값. 0 = 없음 (검토 주기 미설정).
export const REVIEW_FREQUENCY_VALUES = [0, 1, 3, 6, 12] as const;
export type ReviewFrequency = (typeof REVIEW_FREQUENCY_VALUES)[number];

export const WATCH_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "관리 중",
  PAUSED: "일시 중지",
  ARCHIVED: "관심 해제",
};

// 문서화된 배지 톤 — 색이 아니라 강조 단계로 상태를 구분.
export const APPLICABILITY_TONE: Record<string, Tone> = {
  UNKNOWN: "neutral",
  APPLICABLE: "success",
  NOT_APPLICABLE: "neutral",
  NEEDS_REVIEW: "warning",
};

export const IMPORTANCE_TONE: Record<string, Tone> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "danger",
};
