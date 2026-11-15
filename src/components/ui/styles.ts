// 공통 스타일 헬퍼.
//
// Button/Input 은 <button>, <a>(next/link), <select> 어디에나 붙어야 해서
// 컴포넌트가 아니라 "클래스를 만들어 주는 함수"를 기본형으로 둔다.
// 컴포넌트 래퍼는 button.tsx / input.tsx 에서 이 함수를 감싼다.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-fg hover:bg-primary-hover active:bg-primary-active " +
    "disabled:bg-subtle disabled:text-fg-disabled",
  secondary:
    "bg-surface text-fg border border-line-strong hover:bg-hover " +
    "disabled:bg-subtle disabled:text-fg-disabled disabled:border-line",
  ghost:
    "bg-transparent text-fg-secondary hover:bg-hover hover:text-fg " +
    "disabled:text-fg-disabled disabled:hover:bg-transparent",
  danger:
    "bg-danger text-primary-fg hover:opacity-90 " +
    "disabled:bg-subtle disabled:text-fg-disabled",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-9 px-4 text-base gap-2",
  lg: "h-10 px-5 text-base gap-2",
};

export function buttonClass(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  className?: string;
}): string {
  const { variant = "secondary", size = "md", full, className } = opts ?? {};
  return [
    // 조각 시스템: 각진 블록. pill 금지, radius 는 md(4px) 상한.
    "inline-flex items-center justify-center whitespace-nowrap rounded-md",
    "font-medium transition-colors duration-swift ease-swift",
    "disabled:cursor-not-allowed",
    VARIANT[variant],
    SIZE[size],
    full ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 아이콘만 있는 정사각 버튼. aria-label 은 호출부 책임. */
export function iconButtonClass(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = "ghost", size = "md", className } = opts ?? {};
  const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return [
    "inline-flex items-center justify-center rounded-md shrink-0",
    "transition-colors duration-swift ease-swift disabled:cursor-not-allowed",
    VARIANT[variant],
    box,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** input · select · textarea 공용. 높이 40px, radius 8px. */
export function fieldClass(opts?: { className?: string; invalid?: boolean }): string {
  const { className, invalid } = opts ?? {};
  return [
    "w-full h-10 rounded-md border bg-surface px-3 text-base text-fg",
    "placeholder:text-fg-muted",
    "transition-colors duration-swift ease-swift",
    // focus 는 olive 2px. 테두리만 바뀌면 약해서 ring 을 함께 준다.
    "focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary",
    "disabled:bg-subtle disabled:text-fg-disabled disabled:cursor-not-allowed",
    invalid ? "border-danger" : "border-line-strong",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export type Tone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONE: Record<Tone, string> = {
  neutral: "bg-subtle text-fg-secondary border-line",
  primary: "bg-primary-subtle text-primary-text border-primary/25",
  success: "bg-success-subtle text-success border-success/25",
  warning: "bg-warning-subtle text-warning border-warning/25",
  danger: "bg-danger-subtle text-danger border-danger/25",
  info: "bg-info-subtle text-info border-info/25",
};

export function badgeClass(opts?: { tone?: Tone; className?: string }): string {
  const { tone = "neutral", className } = opts ?? {};
  return [
    // pill 금지 (C안 §20). 상태 배지도 조각처럼 각지게.
    "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5",
    "text-xs font-medium whitespace-nowrap",
    TONE[tone],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 상태 점 — 색만으로 의미를 전달하지 않도록 항상 라벨과 함께 쓴다. */
export const DOT_TONE: Record<Tone, string> = {
  neutral: "bg-fg-muted",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
