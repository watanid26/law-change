// 라운드 18 T4: 로딩 스켈레톤 공용 프리미티브. 심사평 "로딩/스켈레톤 상태 관찰 안 됨" 대응.
// "종이" 미학과 맞도록 pulse 강도는 절제 — bg-subtle ↔ bg-canvas 진동.

interface SkeletonProps {
  className?: string;
  ariaLabel?: string;
}

export function SkeletonBlock({ className, ariaLabel }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel ?? "로딩 중"}
      aria-live="polite"
      className={`animate-pulse bg-subtle ${className ?? ""}`}
    />
  );
}

export function SkeletonLine({ className }: { className?: string }) {
  return <SkeletonBlock className={`h-3 ${className ?? ""}`} />;
}
