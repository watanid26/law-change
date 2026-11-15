import type { Tone } from "@/components/ui/styles";

// Task / Evidence UI 라벨 (개인 사용 기준).

export const TASK_STATUS_VALUES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "예정",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
  CANCELLED: "취소",
};

export const TASK_OPEN_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS"];
export const TASK_CLOSED_STATUSES: TaskStatus[] = ["DONE", "CANCELLED"];

// 규정: 갈색조(modified)는 "조문이 수정됨" 전용. 업무 상태에는 재사용하지 않는다.
// 완료(DONE)와의 위계는 border 강도로 구분.
export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  TODO: "neutral",
  IN_PROGRESS: "primary",
  DONE: "success",
  CANCELLED: "neutral",
};

export const TASK_PRIORITY_VALUES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "낮음",
  NORMAL: "보통",
  HIGH: "높음",
  URGENT: "긴급",
};

export const TASK_PRIORITY_TONE: Record<TaskPriority, Tone> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "danger",
};

// Evidence 타입 — v12 스키마 그대로 사용
export const EVIDENCE_TYPE_VALUES = [
  "LINK",
  "FILE",
  "SCREENSHOT",
  "APPROVAL_DOCUMENT",
  "TRAINING_RESULT",
  "SYSTEM_CHANGE",
  "OTHER",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPE_VALUES)[number];

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  LINK: "링크",
  FILE: "파일",
  SCREENSHOT: "스크린샷",
  APPROVAL_DOCUMENT: "결재 문서",
  TRAINING_RESULT: "교육 결과",
  SYSTEM_CHANGE: "시스템 변경",
  OTHER: "기타",
};
