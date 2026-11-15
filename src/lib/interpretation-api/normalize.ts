// 해석례 정규화 — 날짜 형식, 인용 법령 추출, 내용 해시.

import { sha256 } from "@/lib/law-api/normalize";
import type { InterpretationDetail } from "./types";

/**
 * 해석례 날짜. 목록은 "2005.12.23", 상세는 "20051223" 으로 형식이 다르다.
 * 둘 다 받는다. 값이 없는 건이 실재한다(회신일자 1.0% · 해석일자 6%).
 */
export function parseInterpretationDate(raw: string | undefined | null): Date | null {
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

/**
 * 법령명 비교용 정규화.
 * 법령 DB 는 가운뎃점에 ㆍ(U+318D) 를, 해석례는 ·(U+00B7) 를 쓴다. 이 하나
 * 때문에 매칭이 깨졌다 — 실측 147개 인용 중 4개가 이 이유로만 실패했다.
 */
export function normalizeLawTitle(title: string): string {
  return title
    .replace(/[ㆍ·‧∙•・]/g, "·")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 해석례 본문에서 인용한 법령명을 뽑는다.
 * 법제처 문서는 법령명을 「」 로 감싼다 — 실측 표본 60건 전부 그랬다.
 * 「같은 법 제3조」 처럼 조문이 붙거나 지시어만 있는 것은 법령명이 아니다.
 */
const BRACKETED = /「([^」]{2,80})」/g;
const LAW_SUFFIX = /(법|법률|령|시행령|시행규칙|규칙|규정|조례|예규|고시|훈령|지침)$/;
const PRONOUN = /^(같은|동일한|해당|위|본)\s/;

export function extractCitedLawTitles(detail: InterpretationDetail): string[] {
  const text = [detail.안건명, detail.질의요지, detail.회답, detail.이유]
    .filter(Boolean)
    .join("\n");
  const out = new Set<string>();
  for (const m of text.matchAll(BRACKETED)) {
    // "국가공무원법 제3조제1항" 처럼 조문이 붙어 오면 법령명만 남긴다.
    const stripped = m[1].replace(/\s*제\s*\d+\s*조.*$/, "").trim();
    if (!stripped || PRONOUN.test(stripped)) continue;
    if (!LAW_SUFFIX.test(stripped)) continue;
    out.add(normalizeLawTitle(stripped));
  }
  return [...out];
}

/** 제목·질의·회답·이유가 바뀌었는지 판정할 해시. */
export function computeInterpretationHash(detail: InterpretationDetail): string {
  return sha256(
    [detail.안건명, detail.질의요지, detail.회답, detail.이유]
      .map((s) => (s ?? "").replace(/\s+/g, " ").trim())
      .join("\n---\n"),
  );
}

export function buildInterpretationUrl(externalId: string): string {
  return `https://www.law.go.kr/LSW/expcInfoP.do?expcSeq=${encodeURIComponent(externalId)}`;
}
