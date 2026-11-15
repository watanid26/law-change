// 사규 본문에서 근거 법령·조문을 뽑는다.
//
// 사규는 근거를 문언으로 인용한다 — "「근로기준법」 제53조에 따라",
// "산업안전보건법 제29조의 규정에 의하여". 해석례에서 인용 147개 중
// 143개(97%)를 맞춘 방식을 그대로 쓰되, 사규는 「」 를 안 쓰는 경우가
// 있어 괄호 없는 형태도 받는다.
//
// 자동으로 확정하지 않는다. 97% 라도 틀린 3% 를 소리 없이 넣으면 담당자가
// 결과를 못 믿는다. 후보로 제시하고 사람이 고른다.

import { normalizeLawTitle } from "@/lib/interpretation-api/normalize";

export interface PolicyCitation {
  /** 본문에 적힌 그대로의 법령명 */
  rawTitle: string;
  /** 비교용으로 정규화한 법령명 */
  normalizedTitle: string;
  /** "제53조" · "제53조의2" — 조문을 특정하지 못하면 null */
  articleLabel: string | null;
  /** 본문에서 몇 번 인용됐는지. 많이 인용될수록 핵심 근거다. */
  count: number;
}

// 「」 로 감싼 인용
const BRACKETED = /「([^」]{2,80})」\s*(제\s*\d+\s*조(?:의\s*\d+)?)?/g;
// 괄호 없이 "○○법 제N조" 로 쓰는 경우. 법령명 문자를 한글·영숫자·가운뎃점으로
// 묶어 앞 문장이 통째로 딸려오는 것을 막는다.
const BARE = /([가-힣A-Za-z0-9ㆍ·\s]{2,40}?(?:법률|법|시행령|시행규칙|규칙|규정|조례))\s*(제\s*\d+\s*조(?:의\s*\d+)?)/g;

// "같은 법", "이 규정" 같은 지시어는 법령명이 아니다. 앞에 다른 말이 붙어
// 와도(예: "제53조 및 같은 법") 걸러야 한다 — 시작만 보면 통과해 버린다.
const PRONOUN = /(^|[\s및·,])(같은|동일한|해당|이|위|본|앞)\s*(법|법률|령|규정|규칙|조례)/;
// 법령명 앞에 조문 표현이 딸려 온 경우. "제53조 및 근로기준법" 에서
// 법령명만 남긴다.
const LEADING_ARTICLE = /^.*?제\s*\d+\s*조(?:의\s*\d+)?\s*(?:및|과|와|,|·)?\s*/;
// 사규가 자기 자신을 가리키는 말. 근거 법령이 아니다.
const SELF = /^(이\s*)?(규정|규칙|지침|내규|세칙|요령|기준)$/;

function normalizeArticle(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.replace(/\s+/g, "").match(/^제(\d+)조(?:의(\d+))?$/);
  if (!m) return null;
  return m[2] ? `제${Number(m[1])}조의${Number(m[2])}` : `제${Number(m[1])}조`;
}

function accept(title: string): boolean {
  const t = title.trim();
  if (t.length < 2 || t.length > 60) return false;
  if (PRONOUN.test(t)) return false;
  if (SELF.test(t)) return false;
  return /(법률|법|시행령|시행규칙|규칙|규정|조례)$/.test(t);
}

export function extractPolicyCitations(contentText: string | null | undefined): PolicyCitation[] {
  if (!contentText) return [];
  const text = String(contentText);
  // 같은 법령이라도 조문이 다르면 다른 후보다. 키에 조문을 포함한다.
  const found = new Map<string, PolicyCitation>();

  const add = (rawTitle: string, articleRaw?: string) => {
    // 괄호 없는 인용은 앞 문장이 딸려 오기 쉽다. 조문 표현이 앞에 있으면
    // 거기까지 잘라낸다.
    const title = rawTitle.replace(/\s+/g, " ").replace(LEADING_ARTICLE, "").trim();
    if (!accept(title)) return;
    const normalizedTitle = normalizeLawTitle(title);
    const articleLabel = normalizeArticle(articleRaw);
    const key = `${normalizedTitle} ${articleLabel ?? ""}`;
    const prev = found.get(key);
    if (prev) prev.count += 1;
    else found.set(key, { rawTitle: title, normalizedTitle, articleLabel, count: 1 });
  };

  for (const m of text.matchAll(BRACKETED)) add(m[1], m[2]);
  for (const m of text.matchAll(BARE)) add(m[1], m[2]);

  // 조문을 특정한 후보를 먼저, 그다음 많이 인용된 순.
  return [...found.values()].sort((a, b) => {
    if (Boolean(a.articleLabel) !== Boolean(b.articleLabel)) return a.articleLabel ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.normalizedTitle.localeCompare(b.normalizedTitle);
  });
}
