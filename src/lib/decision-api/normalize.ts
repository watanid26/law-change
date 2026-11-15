// 결정문 정규화. ppc 와 ftc 는 같은 뜻의 값을 다른 이름으로 준다.

import { sha256 } from "@/lib/law-api/normalize";
import { normalizeLawTitle } from "@/lib/interpretation-api/normalize";
import type { DecisionSource } from "./client";

export interface NormalizedDecision {
  externalId: string;
  caseNumber: string | null;
  title: string;
  decidedAt: Date | null;
  disposition: string | null;
  summary: string | null;
  reasoning: string | null;
  meetingType: string | null;
  decisionType: string | null;
  contentHash: string;
  citedLawTitles: string[];
}

/** "2020.10.28." · "2024.9.25." · "20201028" 이 모두 온다. */
export function parseDecisionDate(raw: unknown): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // "2024.9.25." 처럼 월·일이 한 자리로 오는 값이 실재한다. 숫자만 뽑으면
  // 7자리가 되어 8자리 검사에서 탈락한다 — ppc 날짜가 통째로 null 이 됐다.
  const dotted = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  let y: number, m: number, d: number;
  if (dotted) {
    y = Number(dotted[1]); m = Number(dotted[2]); d = Number(dotted[3]);
  } else {
    const digits = s.replace(/[^\d]/g, "");
    if (digits.length !== 8) return null;
    y = Number(digits.slice(0, 4)); m = Number(digits.slice(4, 6)); d = Number(digits.slice(6, 8));
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

// ppc 별지는 <img> 태그만 들어 있는 경우가 30% 다. 태그를 걷어내면 남는 게
// 없으니 본문으로 치지 않는다.
function stripTags(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const plain = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > 0 ? plain : null;
}

const BRACKETED = /「([^」]{2,80})」/g;
const LAW_SUFFIX = /(법|법률|령|시행령|시행규칙|규칙|규정|조례|예규|고시|훈령|지침)$/;
const PRONOUN = /^(같은|동일한|해당|위|본)\s/;

export function extractCitedLawTitles(texts: (string | null | undefined)[]): string[] {
  const joined = texts.filter(Boolean).join("\n");
  const out = new Set<string>();
  for (const m of joined.matchAll(BRACKETED)) {
    const stripped = m[1].replace(/\s*제\s*\d+\s*조.*$/, "").trim();
    if (!stripped || PRONOUN.test(stripped)) continue;
    if (!LAW_SUFFIX.test(stripped)) continue;
    out.add(normalizeLawTitle(stripped));
  }
  return [...out];
}

export function normalizeDecision(
  source: DecisionSource,
  externalId: string,
  d: Record<string, unknown>,
): NormalizedDecision {
  const isPpc = source === "PPC";
  const title = str(isPpc ? d["안건명"] : d["사건명"]) ?? "(제목 없음)";
  const disposition = stripTags(d["주문"]);
  const summary = stripTags(d["결정요지"]);
  const reasoning = stripTags(d["이유"]);

  return {
    externalId,
    caseNumber: str(isPpc ? d["안건번호"] : d["사건번호"]),
    title,
    decidedAt: parseDecisionDate(isPpc ? (d["의결일자"] ?? d["의결연월일"]) : d["결정일자"]),
    disposition,
    summary,
    reasoning,
    meetingType: str(d["회의종류"]),
    decisionType: str(isPpc ? d["결정"] : d["문서유형"]),
    contentHash: sha256(
      [title, disposition, summary, reasoning].map((s) => s ?? "").join("\n---\n"),
    ),
    citedLawTitles: extractCitedLawTitles([title, disposition, summary, reasoning]),
  };
}

export function buildDecisionUrl(source: DecisionSource, externalId: string): string {
  const target = source === "PPC" ? "ppc" : "ftc";
  return `https://www.law.go.kr/DRF/lawService.do?target=${target}&ID=${encodeURIComponent(externalId)}&type=HTML`;
}
