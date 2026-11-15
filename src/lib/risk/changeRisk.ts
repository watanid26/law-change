// 개정 하나가 우리에게 얼마나 급한 일인지, 문서 자체가 말하는 만큼만 판정한다.
//
// 왜 만들었나
//   실사용 평가에서 가장 낮은 점수를 받은 축이 "업무에 도움이 됨" 이었다(4/10).
//   화면이 "제26조가 수정됨" 까지만 말하고, "그래서 우리가 뭘 해야 하나" 는
//   담당자가 조문을 읽어 판단해야 했다. 영향도조차 사람이 고르는 필드다.
//
// 왜 AI 가 아니라 규칙인가
//   1) 근거를 보여줄 수 있다. 컴플라이언스에서 "왜 높음인지" 를 설명 못 하는
//      판정은 쓸 수 없다. 여기서는 "제98조(벌칙)가 수정됨" 을 함께 낸다.
//   2) 환각이 없다. 규칙은 틀려도 재현 가능하고 고칠 수 있다.
//   3) 비용과 지연이 0 이다.
//   4) 나중에 AI 를 얹을 때 이 신호가 그대로 재료가 된다.
//
// 무엇을 안 하는가
//   "우리 회사" 기준의 판단은 하지 않는다. 그러려면 우리가 무엇을 하는
//   회사인지 알아야 하는데, 앱에 그 입력이 아직 없다(조문 단위 감시 0건 ·
//   사규 연결 0건 · 적용 여부 판단 0/21). 그건 다음 단계다.
//   그래서 이 값은 "판정" 이 아니라 신호다 — 사람이 고르는 impactLevel 을
//   덮어쓰지 않고 나란히 놓는다.

import { euro } from "@/lib/korean/particle";

export type RiskLevel = "high" | "medium" | "low" | "none";

export interface RiskInput {
  changeType: string;            // ADDED | DELETED | MODIFIED | MOVED | ...
  /** 조문 번호. "제98조" */
  label: string | null;
  /** 조문 제목. "벌칙" · "과태료" — 신호는 대부분 여기서 나온다. */
  title: string | null;
  /** 신설 조문의 본문. 의무 표현을 찾을 때만 쓴다. */
  text?: string | null;
}

export interface RiskVerdict {
  level: RiskLevel;
  /** 왜 그렇게 봤는지. 화면에 그대로 보여준다. 최대 3개. */
  reasons: string[];
  /** 더 있으면 몇 개나 더 있는지. */
  more: number;
}

/**
 * 어기면 처벌로 이어지는 조문. 여기가 바뀌면 가장 급하다.
 * 조문 제목에서 부분일치로 찾는다 — 제목에 공백이 없는 문서가 있어서
 * (예: "기획관리관을보좌하는담당관") 토큰 분리는 쓰지 않는다.
 */
const PENALTY = ["벌칙", "과태료", "벌금", "징역", "과징금", "행정처분", "영업정지", "허가취소", "등록취소", "자격정지"];

/** 지키려면 우리가 뭔가를 해야 하는 조문. */
const DUTY = ["신고", "보고", "제출", "기록", "보존", "교육", "검사", "점검", "표시", "표기", "인증", "허가", "등록", "승인", "안전", "위생", "관리기준"];

/** 신설 조문 본문에서 "새 의무가 생겼다" 를 가르는 표현. */
const OBLIGATION = ["하여야 한다", "해야 한다", "하여서는 아니", "받아야 한다", "갖추어야", "두어야 한다"];

function hit(haystack: string | null | undefined, needles: string[]): string | null {
  if (!haystack) return null;
  for (const n of needles) if (haystack.includes(n)) return n;
  return null;
}

/** "제98조(벌칙)" — 근거 문장에 쓸 이름. */
function name(d: RiskInput): string {
  const label = d.label?.trim() || "조문";
  return d.title?.trim() ? `${label}(${d.title.trim()})` : label;
}

const ORDER: Record<RiskLevel, number> = { high: 3, medium: 2, low: 1, none: 0 };

/**
 * 같은 등급 안에서의 우선순위.
 *
 * 실물에서 "행정처분의 기준" 이 수정된 개정을 열었더니 근거 세 줄이 전부
 * 신설 조문이고 정작 행정처분은 "그 밖에 21건" 에 묻혔다. 둘 다 높음이지만
 * 어기면 처벌로 이어지는 쪽이 먼저 읽혀야 한다.
 */
const KIND_ORDER = { penalty: 2, duty: 1, other: 0 } as const;
type ReasonKind = keyof typeof KIND_ORDER;

/**
 * 변경 조문 목록에서 신호를 낸다.
 *
 *   높음  처벌 조문이 신설·수정됐다 / 의무 조문이 신설됐다 /
 *         신설 조문 본문에 새 의무 표현이 있다
 *   중간  의무 조문이 수정됐다 / 처벌 조문이 삭제됐다(규제 변동)
 *   낮음  그 밖의 변경
 *   없음  변경이 없다
 */
export function assessChangeRisk(diffs: RiskInput[]): RiskVerdict {
  if (diffs.length === 0) return { level: "none", reasons: [], more: 0 };

  const found: { level: RiskLevel; kind: ReasonKind; reason: string }[] = [];

  for (const d of diffs) {
    const type = d.changeType.toUpperCase();
    const penalty = hit(d.title, PENALTY);
    const duty = hit(d.title, DUTY);

    if (penalty && (type === "ADDED" || type === "MODIFIED")) {
      found.push({
        level: "high",
        kind: "penalty",
        reason: `${name(d)}가 ${type === "ADDED" ? "신설" : "수정"}됐습니다 — 어기면 ${euro(penalty)} 이어지는 조문입니다`,
      });
      continue;
    }
    if (penalty && type === "DELETED") {
      found.push({ level: "medium", kind: "penalty", reason: `${name(d)}가 삭제됐습니다 — 처벌 기준이 바뀌었습니다` });
      continue;
    }
    if (duty && type === "ADDED") {
      found.push({ level: "high", kind: "duty", reason: `${name(d)}가 신설됐습니다 — 새로 지켜야 할 것이 생깁니다` });
      continue;
    }
    if (type === "ADDED" && hit(d.text, OBLIGATION)) {
      found.push({ level: "high", kind: "duty", reason: `${name(d)}가 신설되며 새 의무가 생깁니다` });
      continue;
    }
    if (duty && type === "MODIFIED") {
      found.push({ level: "medium", kind: "duty", reason: `${name(d)}가 수정됐습니다 — 지켜야 할 내용이 바뀌었습니다` });
      continue;
    }
    if (type === "DELETED") {
      found.push({ level: "low", kind: "other", reason: `${name(d)}가 삭제됐습니다` });
    }
  }

  if (found.length === 0) {
    return { level: "low", reasons: [], more: 0 };
  }

  // 급한 것부터. 같은 등급이면 처벌 쪽을 먼저, 그다음은 조문 순서를 지킨다.
  found.sort(
    (a, b) => ORDER[b.level] - ORDER[a.level] || KIND_ORDER[b.kind] - KIND_ORDER[a.kind],
  );
  const level = found[0].level;
  const reasons = found.slice(0, 3).map((f) => f.reason);
  return { level, reasons, more: Math.max(0, found.length - reasons.length) };
}

/**
 * 배지 문구.
 *
 * "확인 필요" 였는데 대시보드 섹션 제목이 "확인이 필요한 변경" 이라 그 안에서
 * 같은 말이 두 번 나온다. 신호가 아니라 소음이 된다.
 * 읽는 순서로 부른다 — 법적 판단이 아니라 "무엇부터 볼까" 이기 때문이다.
 */
export const RISK_LABEL: Record<RiskLevel, string> = {
  high: "먼저 볼 것",
  medium: "살펴볼 것",
  low: "단순 변경",
  none: "본문 변경 없음",
};

/**
 * 배지 문구 옆에 붙일 한 줄. 등급 이름만으로는 "그래서 뭐" 가 안 읽힌다.
 */
export const RISK_HINT: Record<RiskLevel, string> = {
  high: "처벌로 이어지거나 새로 지켜야 할 내용이 바뀌었습니다.",
  medium: "지켜야 할 내용이 바뀌었습니다. 우리에게 해당되는지 확인하세요.",
  low: "조문이 바뀌었지만 의무·처벌과 직접 이어지는 표시는 없습니다.",
  none: "이 개정에는 조문 본문 변경이 없습니다.",
};
