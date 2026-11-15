import { createHash } from "node:crypto";
import type { ArticleUnit } from "./types";
import { toArray } from "./client";
import { dedupeArticleKeys } from "./dedupeArticleKeys";

// ────────── 날짜 파싱 ──────────
// 법제처 API는 YYYYMMDD 문자열로 날짜를 반환
export function parseApiDate(yyyymmdd: string | undefined | null): Date | null {
  if (!yyyymmdd) return null;
  const s = String(yyyymmdd).trim();
  if (s.length !== 8 || !/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

// 법제처는 시행일이 정해지지 않은 판에 9999-01-01 / 9999-12-31 같은 자리표시
// 값을 넣는다. 그대로 저장하면 화면에 "시행 D-2913000" 이 나가고 시행 임박
// 목록이 오염된다. API 원본이 그렇게 준다 — 우리 파싱 문제가 아니다.
//
// 실측 11건의 성격이 갈린다.
//   조건부 시행 8건 — "이 규칙은 아랍에미리트와의 협정 제18.4조에 따라 같은
//                    협정이 발효되는 날부터 시행한다" → 진짜 미정
//   값만 자리표시 3건 — 부칙은 "이 고시는 고시한 날부터 시행한다" 인데
//                    시행일자만 99991231 → 발령일로 보정할 수 있다
const SENTINEL_YEAR = 2100;

export function isSentinelDate(d: Date | null | undefined): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= SENTINEL_YEAR;
}

// 부칙에 적힌 명시적 시행일. "2026년 4월 30일부터 시행" / "2026.4.30.부터 시행"
const EXPLICIT_DATE = /(\d{4})\s*[년.]\s*(\d{1,2})\s*[월.]\s*(\d{1,2})\s*일?\s*부터\s*시행/;
// "공포한 날부터" / "고시한 날부터" / "발령한 날부터" — 공포·발령일이 곧 시행일
const SAME_DAY = /(공포|고시|발령|훈령)한?\s*날\s*부터\s*시행/;

export function resolveEffectiveDate(
  parsed: Date | null,
  opts: { promulgationDate?: Date | null; addendumText?: string | null } = {},
): Date | null {
  if (!isSentinelDate(parsed)) return parsed;

  const text = (opts.addendumText ?? "").replace(/\s+/g, " ");
  const m = text.match(EXPLICIT_DATE);
  if (m) {
    const d = parseApiDate(`${m[1].padStart(4, "0")}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`);
    if (d && !isSentinelDate(d)) return d;
  }
  if (SAME_DAY.test(text) && opts.promulgationDate) return opts.promulgationDate;

  // 협정 발효일처럼 날짜를 알 수 없는 것은 미정으로 둔다. null 이면 화면이
  // "시행일 미정" 으로 그리고 D-day 계산에서 빠진다.
  return null;
}

// ────────── 텍스트 정규화 ──────────
// 조문내용에서 diff 노이즈를 제거하되, 실제 개정 표시(<개정 YYYY.M.D>)는 유지 여부 선택
const OPENING_TAG = /<[^>]+>/g;
const NBSP = / |&nbsp;/g;
const MULTISPACE = /[ \t]{2,}/g;
const MULTIBREAK = /\n{3,}/g;

export interface NormalizeOptions {
  stripRevisionMarkers?: boolean; // <개정 2014.3.24> 같은 마커 제거 (Diff 안정성용)
}

export function normalizeText(input: string, opts: NormalizeOptions = {}): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(OPENING_TAG, "");
  s = s.replace(NBSP, " ");
  s = s.replace(/\r\n?/g, "\n");
  if (opts.stripRevisionMarkers) {
    // <개정 2020.2.4, 2023.3.14> · <신설 2020.2.4> · <제목개정 ...> 등
    s = s.replace(/<(개정|신설|삭제|제목개정|전문개정)[^>]*>/g, "");
  }
  s = s.replace(MULTISPACE, " ");
  s = s.replace(MULTIBREAK, "\n\n");
  return s.trim();
}

// ────────── 조문 전체 텍스트 조립 ──────────
// 법제처 조문 구조:
//   조 → 조문내용 (짧은 헤더 or 본문)
//     항 (①②③...) → 항내용
//       호 (1.2.3.) → 호내용
//         목 (가.나.다.) → 목내용
// 위 계층 순서를 유지하며 flat 텍스트로 조립 (diff/hash·화면 표시 공용).
export function assembleArticleText(article: ArticleUnit): string {
  const parts: string[] = [];
  if (article.조문내용) parts.push(article.조문내용);

  const hangs = toArray(article.항);
  for (const hang of hangs) {
    if (hang?.항내용) parts.push(hang.항내용);

    const hos = toArray(hang?.호);
    for (const ho of hos) {
      if (ho?.호내용) parts.push(ho.호내용);

      const moksInHo = toArray(ho?.목);
      for (const mok of moksInHo) {
        if (mok?.목내용) parts.push(mok.목내용);
      }
    }

    // 항 바로 아래에 (호 없이) 목이 붙는 케이스 방어
    const moksInHang = toArray(hang?.목);
    for (const mok of moksInHang) {
      if (mok?.목내용) parts.push(mok.목내용);
    }
  }
  return parts.join("\n");
}

// ────────── 조문 표시용 데이터 ──────────
export interface NormalizedArticle {
  articleKey: string;
  articleNumber: string; // "제N조" or "제N조의M"
  articleTitle: string | null;
  articleText: string; // 정규화된 전문
  articleHash: string; // 정규화된 전문의 SHA-256
  articleOrder: number;
  effectiveDate: Date | null;
  isMovedFrom: string | null;
  isMovedTo: string | null;
  isRealArticle: boolean; // 전문(장 헤더) 제외
}

export function normalizeArticle(article: ArticleUnit, order: number): NormalizedArticle {
  const raw = assembleArticleText(article);
  const cleanForDiff = normalizeText(raw, { stripRevisionMarkers: true });
  const branch = article.조문가지번호 && article.조문가지번호 !== "0"
    ? `의${article.조문가지번호}`
    : "";
  const articleNumber = `제${article.조문번호}조${branch}`;

  return {
    articleKey: article.조문키,
    articleNumber,
    articleTitle: article.조문제목?.trim() || null,
    articleText: cleanForDiff,
    articleHash: sha256(cleanForDiff),
    articleOrder: order,
    effectiveDate: parseApiDate(article.조문시행일자),
    isMovedFrom: article.조문이동이전?.trim() || null,
    isMovedTo: article.조문이동이후?.trim() || null,
    isRealArticle: article.조문여부 === "조문",
  };
}

// ────────── 법령 전체 정규화 (조문 목록) ──────────
export function normalizeArticles(articleUnits: ArticleUnit[] | ArticleUnit | undefined): NormalizedArticle[] {
  const arr = toArray(articleUnits);
  // 법령 쪽에서는 아직 조문키 충돌이 관측되지 않았지만(5,602건 수집 완료),
  // 같은 방어를 둔다 — 겹치지 않으면 키를 건드리지 않으므로 무해하다.
  return dedupeArticleKeys(arr.map((a, i) => normalizeArticle(a, i)));
}

// 저장할 본문 단위를 고른다.
// 보통은 조문(조문여부="조문")만 남기고 전문(장·절 헤더)은 버린다. 그런데
// 조문이 하나도 없는 법령이 실재한다 — "연호에 관한 법률", "표준시에 관한
// 법률" 처럼 조 구조 없이 한 문장인 법, 그리고 타법폐지로 "이 법은 폐지한다"
// 한 줄만 남은 법(검찰청법 2026-10-02 폐지 등). 이때 전문까지 버리면 본문이
// 0개로 저장되고, 화면의 "조문 전문" 이 통째로 빈다.
// 조문이 하나라도 있으면 기존 동작 그대로다.
export function selectStorableArticles(articles: NormalizedArticle[]): NormalizedArticle[] {
  const real = articles.filter((a) => a.isRealArticle);
  if (real.length > 0) return real;
  return articles
    .filter((a) => a.articleText.trim().length > 0)
    // 전문은 조문번호가 "0" 이라 "제0조" 가 된다. 화면에 그대로 나가면 안 된다.
    .map((a) => ({ ...a, articleNumber: "본문" }));
}

// ────────── 문서 전체 hash (전체 조문 hash 배열의 hash) ──────────
export function computeDocumentHash(articles: NormalizedArticle[]): string {
  // 저장하는 단위와 같은 기준으로 계산해야 한다. 조문이 없는 법령을
  // isRealArticle 로만 걸러 hash 를 내면 본문이 무엇이든 늘 같은 값이 나와,
  // 내용이 바뀌어도 "변경 없음" 으로 판정된다.
  const combined = selectStorableArticles(articles)
    .map((a) => `${a.articleKey}:${a.articleHash}`)
    .join("\n");
  return sha256(combined);
}

// ────────── SHA-256 ──────────
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
