"use client";

// 공용 서버 액션 상태 메시지 렌더러. 스크린리더 대응까지 이 컴포넌트에서 담당.
// - 성공: role="status", aria-live="polite" (안내)
// - 실패: role="alert", aria-live="assertive" (즉시 안내)
// className 은 컴포넌트별로 오버라이드 가능.

interface Status {
  kind: "idle" | "ok" | "error";
  msg?: string;
}

interface Props {
  status: Status;
  okClassName?: string;
  errorClassName?: string;
}

export function AsyncStatusMessage({
  status,
  okClassName = "text-sm text-primary-text",
  errorClassName = "text-sm text-danger",
}: Props) {
  if (status.kind === "ok") {
    return (
      <span role="status" aria-live="polite" className={okClassName}>
        {status.msg}
      </span>
    );
  }
  if (status.kind === "error") {
    return (
      <span role="alert" aria-live="assertive" className={errorClassName}>
        {status.msg}
      </span>
    );
  }
  return null;
}
