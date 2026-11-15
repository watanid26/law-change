// 한 문서 안에서 조문 키가 겹칠 때 갈라주는 규칙.
//
// 법제처 원문에 같은 조 번호가 두 번 나오는 문서가 실재한다.
//   경인지방데이터청 공적심사규정   제5조(추천)  + 제5조(심사)
//   경찰공무원 채용시험에 관한 규칙  제23조(면접위원의 선발 및 평정요소)
//                                  + 제23조(면접위원의 선발)
//   공기업·준정부기관 예비타당성조사 운용지침  제27조(재검토기한) ×2 (제목까지 동일)
//
// articleKey 를 "제N조의M" 만으로 만들다 보니 이런 문서에서 두 번째 조문이
// legal_content_unit_version 의 (document_version_id, content_unit_id) 유일키에
// 걸려 수집 자체가 실패했다. 행정규칙 백필에서 실제로 터졌다 — 고시는 조문
// 구조가 적어 안 걸렸고, 훈령·예규·지침·규정이 들어오면서 드러났다.
//
// 접미사를 순번(1, 2, …)으로만 붙이면 다음 개정에서 두 조문의 순서가 바뀔 때
// 조문 추적이 통째로 어긋난다. 그래서 제목을 먼저 쓴다 — 제목은 순서보다
// 안정적이다. 제목까지 같으면 그때만 순번으로 떨어진다.

/** 제목을 키에 넣기 좋게 — 공백·구분기호 제거. */
function titleSlug(title: string | null): string {
  if (!title) return "";
  return title.replace(/[\s·ㆍ・‧⋅.,()[\]「」『』<>《》〈〉\-–—/]/g, "").slice(0, 24);
}

/**
 * 조문 배열의 articleKey 를 문서 안에서 유일하게 만든다.
 * 겹치지 않는 조문은 키가 그대로다 — 기존 데이터와 호환된다.
 */
export function dedupeArticleKeys<T extends { articleKey: string; articleTitle: string | null }>(
  articles: T[],
): T[] {
  const seen = new Map<string, number>();
  return articles.map((a) => {
    const count = seen.get(a.articleKey) ?? 0;
    seen.set(a.articleKey, count + 1);
    if (count === 0) return a; // 처음 나온 키는 건드리지 않는다

    const slug = titleSlug(a.articleTitle);
    const candidate = slug ? `${a.articleKey}~${slug}` : `${a.articleKey}~${count}`;
    // 제목까지 같아서 후보 키마저 겹치면 순번으로 떨어진다.
    const dup = seen.get(candidate) ?? 0;
    seen.set(candidate, dup + 1);
    const articleKey = dup === 0 ? candidate : `${candidate}~${dup}`;
    return { ...a, articleKey };
  });
}
