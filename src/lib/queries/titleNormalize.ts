// 법령명 정규화 — 공백과 구분기호를 지운다.
//
// 한국 법령명은 띄어쓰기와 가운뎃점이 많아서, 사용자가 기억하는 표기와
// 공식 표기가 조금만 달라도 안 맞는다. 특히 라틴 中點(·)과 한글
// 가운뎃점(ㆍ)은 눈으로 구분이 안 되는데 코드포인트가 다르다.
//
// prisma 를 끌어오지 않아야 테스트에서 바로 부를 수 있어 파일을 나눴다.
// SQL 쪽 regexp_replace 와 같은 문자 집합을 지운다.

/** SQL(regexp_replace)에서 쓰는 문자 클래스. lawSearch 와 공유한다. */
export const STRIP_CLASS = String.raw`[[:space:]·ㆍ・‧⋅.,()\[\]「」『』<>《》〈〉\-–—/]`;

export function normalizeQuery(raw: string): string {
  return raw.replace(/[\s·ㆍ・‧⋅.,()[\]「」『』<>《》〈〉\-–—/]/g, "");
}

/** 검색어를 공백 기준 토큰으로 쪼갠 뒤 각각 정규화. 빈 토큰은 버린다. */
export function searchTokens(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((t) => normalizeQuery(t))
    .filter((t) => t.length > 0);
}
