// 행정규칙 조문 텍스트 → 정규화된 조문 목록
// 행정규칙은 조문내용이 flat 문자열 배열 (각 원소가 한 조문).
// 우리는 각 원소에서 "제N조(제목)" 헤더를 파싱해 articleKey/number/title/text 를 뽑는다.

import type { NormalizedArticle } from "@/lib/law-api/normalize";
import { normalizeText, sha256, parseApiDate } from "@/lib/law-api/normalize";
import type { AdminRuleAddendum, AdminRuleDetailResponse } from "./types";
import { toArray } from "./client";
import { dedupeArticleKeys } from "@/lib/law-api/dedupeArticleKeys";

// "제1조(목적) 이 고시는..." / "제3조의2(정의) ..." / "제N조" (제목 없음)
const ARTICLE_HEAD = /^\s*제\s*(\d+)\s*조(?:의\s*(\d+))?(?:\s*\(([^)]*)\))?/;

// 본문이 어느 키에 오는지는 행정규칙 종류마다 다르다.
//   고시·훈령·예규 대부분 → AdmRulService.조문내용 (문자열 배열)
//   국무총리훈령·대통령훈령 → AdmRulService.조문.조문내용 (블록 안 배열)
// 후자를 못 읽어서 159건이 본문 0조문으로 수집돼 있었다.
export function extractAdminRuleArticleTexts(
  service: AdminRuleDetailResponse["AdmRulService"] | undefined,
): string[] {
  if (!service) return [];
  const flat = toArray(service.조문내용).filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0,
  );
  if (flat.length > 0) return flat;
  return toArray(service.조문).flatMap((block) =>
    toArray(block?.조문내용).filter(
      (s): s is string => typeof s === "string" && s.trim().length > 0,
    ),
  );
}

export interface ExtractedAttachment {
  fileName: string;
  sourceUrl: string;
}

// 본문이 조문으로 오지 않고 첨부 파일로만 제공되는 문서가 697건 있다
// (고시 611 · 예규 37 · 공고 18 ...). API 가 본문 텍스트를 아예 주지 않으므로
// 최소한 파일 이름과 내려받기 링크는 보여줘야 한다.
export function extractAdminRuleAttachments(
  service: AdminRuleDetailResponse["AdmRulService"] | undefined,
): ExtractedAttachment[] {
  const out: ExtractedAttachment[] = [];
  for (const block of toArray(service?.첨부파일)) {
    const names = toArray(block?.첨부파일명);
    const urls = toArray(block?.첨부파일링크);
    for (let i = 0; i < urls.length; i++) {
      const url = typeof urls[i] === "string" ? urls[i].trim() : "";
      if (!url) continue;
      out.push({
        // 페이지가 https 라 http 링크는 브라우저가 막는다.
        sourceUrl: url.replace(/^http:\/\//, "https://"),
        fileName: (typeof names[i] === "string" ? names[i].trim() : "") || `첨부 ${i + 1}`,
      });
    }
  }
  return out;
}

export function normalizeAdminRuleArticles(
  articleTexts: string | string[] | undefined,
): NormalizedArticle[] {
  const arr = toArray(articleTexts).filter((s) => typeof s === "string" && s.trim().length > 0);
  const results: NormalizedArticle[] = [];
  arr.forEach((raw, idx) => {
    const cleaned = normalizeText(raw, { stripRevisionMarkers: true });
    const match = cleaned.match(ARTICLE_HEAD);
    if (!match) {
      // 헤더 없이 이어지는 텍스트 — 이전 조문에 합침
      if (results.length > 0) {
        const last = results[results.length - 1];
        const mergedText = `${last.articleText}\n${cleaned}`;
        results[results.length - 1] = {
          ...last,
          articleText: mergedText,
          articleHash: sha256(mergedText),
        };
      } else {
        results.push({
          articleKey: `raw-${idx}`,
          articleNumber: "본문",
          articleTitle: null,
          articleText: cleaned,
          articleHash: sha256(cleaned),
          articleOrder: idx,
          effectiveDate: null,
          isMovedFrom: null,
          isMovedTo: null,
          isRealArticle: true,
        });
      }
      return;
    }
    const num = Number(match[1]);
    const branch = match[2] ? Number(match[2]) : 0;
    const title = match[3]?.trim() || null;
    const articleKey = `${String(num).padStart(4, "0")}${String(branch).padStart(3, "0")}`;
    const articleNumber = branch > 0 ? `제${num}조의${branch}` : `제${num}조`;
    results.push({
      articleKey,
      articleNumber,
      articleTitle: title,
      articleText: cleaned,
      articleHash: sha256(cleaned),
      articleOrder: idx,
      effectiveDate: null,
      isMovedFrom: null,
      isMovedTo: null,
      isRealArticle: true,
    });
  });
  // 같은 조 번호가 두 번 나오는 문서가 실재한다. 그대로 두면 content unit
  // 유일키에 걸려 문서 수집 자체가 실패한다.
  return dedupeArticleKeys(results);
}

export function computeAdminRuleDocumentHash(articles: NormalizedArticle[]): string {
  const combined = articles.map((a) => `${a.articleKey}:${a.articleHash}`).join("\n");
  return sha256(combined);
}

// 부칙에서 시행일 추출 (예: "이 고시는 2026년 6월 1일부터 시행한다")
// 실패해도 nullable — effectiveDateText 로 원문 보존
export function extractEffectiveDate(
  addenda: AdminRuleAddendum | AdminRuleAddendum[] | undefined,
): { date: Date | null; text: string | null } {
  const list = toArray(addenda);
  if (list.length === 0) return { date: null, text: null };
  // 부칙 중 가장 최근(공포일자 기준) 하나만 채택
  const sorted = list
    .filter((a) => a.부칙공포일자)
    .sort((a, b) => (b.부칙공포일자 ?? "").localeCompare(a.부칙공포일자 ?? ""));
  const primary = sorted[0] ?? list[0];
  const raw = toArray(primary.부칙내용).join("\n");
  if (!raw) return { date: null, text: null };
  const match = raw.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*부터\s*시행/);
  if (match) {
    const y = match[1].padStart(4, "0");
    const m = match[2].padStart(2, "0");
    const d = match[3].padStart(2, "0");
    return { date: parseApiDate(`${y}${m}${d}`), text: raw.slice(0, 500) };
  }
  return { date: null, text: raw.slice(0, 500) };
}
