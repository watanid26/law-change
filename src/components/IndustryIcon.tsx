// 산업 아이콘.
//
// public/icons/industry/*.svg 여섯 개를 인라인으로 옮겼다. 프리셋은 39개인데
// 아이콘은 6종이라, 프리셋 key 를 여섯 갈래로 묶어 매핑한다. 매핑에 없으면
// 브랜드 마크(조각 격자)로 폴백한다 — 임의의 아이콘을 지어내지 않는다.
//
// 전부 stroke 1.5 · currentColor · square geometry (C안 §18).

import { BrandMark } from "./BrandMark";
import { cx } from "./ui/styles";

export type IndustryIconName =
  | "it-platform"
  | "finance"
  | "manufacturing"
  | "healthcare"
  | "logistics"
  | "construction";

const PATHS: Record<IndustryIconName, React.ReactNode> = {
  "it-platform": (
    <path d="M3 5h18v11H3zM9 20h6M12 16v4" />
  ),
  finance: (
    <path d="M3 9h18M5 9v8M9 9v8M15 9v8M19 9v8M3 18h18M2 21h20M12 3l9 4H3l9-4Z" />
  ),
  manufacturing: (
    <path d="M3 21V10l6 4V10l6 4V4h6v17H3ZM7 17h.01M13 17h.01M18 17h.01" />
  ),
  healthcare: (
    <path d="M12 4v16M4 12h16" />
  ),
  logistics: (
    <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
  ),
  construction: (
    <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
  ),
};

/** 프리셋 key → 아이콘. 접두어 매칭이라 새 프리셋이 늘어도 대개 잡힌다. */
export function industryIconFor(key: string): IndustryIconName | null {
  if (/^(it|saas|platform|ecommerce|game|telecom|data|ai)/.test(key)) return "it-platform";
  if (/^(finance|bank|securities|insurance|fintech|credit|payment)/.test(key)) return "finance";
  if (/^(manufact|chemical|food|cosmetic|electronics|auto|steel|textile)/.test(key))
    return "manufacturing";
  if (/^(health|medical|pharma|bio|device|hospital)/.test(key)) return "healthcare";
  if (/^(logistics|delivery|transport|retail|distribution|trade|import)/.test(key))
    return "logistics";
  if (/^(construct|realestate|estate|architect|housing|plant|energy)/.test(key))
    return "construction";
  return null;
}

export function IndustryIcon({
  name,
  size = 20,
  className,
}: {
  name: IndustryIconName | null;
  size?: number;
  className?: string;
}) {
  if (!name) return <BrandMark size={size} className={className} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={cx("inline-block shrink-0 align-middle", className)}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
