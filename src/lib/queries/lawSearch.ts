// 법령명 검색 정규화.
//
// 문제: 기존 검색은 `currentTitle contains 검색어` 단일 부분일치였다.
// 한국 법령명은 띄어쓰기와 가운뎃점이 많아서, 사용자가 기억하는 표기와
// 공식 표기가 조금만 달라도 0건이 나온다. 사용성 테스트 실측:
//
//   "축산물위생관리법"  → 0건   (공식 표기는 "축산물 위생관리법")
//   "축산물 위생관리법" → 3건
//   "표시광고"          → 0건   (공식 표기는 "표시·광고")
//
// 존재하는 법령을 못 찾게 만드는 건 검색 기능의 신뢰를 통째로 깎는다.
// 리뷰어가 "하나만 고친다면" 으로 꼽은 항목이기도 하다.
//
// 해결: 양쪽(제목·검색어)에서 공백과 구분기호를 제거한 뒤 비교한다.
// 검색어를 아무리 변형해도 **제목 쪽**을 정규화하지 않으면 매칭이 안 되므로,
// Prisma 의 contains 로는 불가능하고 SQL 함수가 필요하다.
//
// 여러 단어를 띄어 쓴 검색("식품 표시")은 토큰마다 AND 로 묶는다.
// 정규화만 하면 "식품표시" 가 되어 "식품 등의 표시" 를 못 잡기 때문이다.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STRIP_CLASS, normalizeQuery, searchTokens } from "./titleNormalize";

export { normalizeQuery, searchTokens } from "./titleNormalize";

/**
 * 제목이 모든 토큰을 포함하는지 검사하는 SQL 조건.
 * 제목에서 공백·구분기호를 지운 뒤 대소문자 무시 부분일치.
 *
 * 반환값은 Prisma.Sql 이라 다른 조건과 AND 로 합칠 수 있다.
 */
export function titleMatchesSql(tokens: string[]): Prisma.Sql {
  const stripped = Prisma.sql`regexp_replace(d."current_title", ${STRIP_CLASS}, '', 'g')`;
  return Prisma.join(
    tokens.map((t) => Prisma.sql`${stripped} ILIKE ${"%" + t + "%"}`),
    " AND ",
  );
}

/**
 * 검색어에 매칭되는 문서 id 를 반환한다.
 *
 * 결과 수가 많을 수 있어 상한을 둔다. 상한에 걸리면 `truncated: true` 로 알려서
 * 호출부가 "결과가 더 있다"를 표시하거나 검색어를 좁히도록 안내할 수 있다.
 * 조용히 잘라내고 전부인 척하지 않는다.
 */
export async function findDocumentIdsByTitle(
  search: string,
  limit = 3000,
): Promise<{ ids: string[]; truncated: boolean }> {
  const tokens = searchTokens(search);
  if (tokens.length === 0) return { ids: [], truncated: false };

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT d."id"
    FROM "legal_document" d
    WHERE ${titleMatchesSql(tokens)}
    LIMIT ${limit + 1}
  `;
  const truncated = rows.length > limit;
  return { ids: rows.slice(0, limit).map((r) => r.id), truncated };
}

/**
 * 정해진 법령명 목록을 정규화 기준으로 한 번에 찾는다. 산업별 프리셋처럼
 * "이 이름들이 DB 에 있나" 를 확인하는 곳에서 쓴다.
 *
 * 프리셋은 currentTitle 완전일치로 찾고 있었는데, 프리셋은 가운뎃점을
 * 라틴 中點(·)으로 적고 법제처는 한글 가운뎃점(ㆍ)을 쓴다. 눈으로는 같은
 * 글자라 아무도 못 알아채는 채로 9건이 "확인 불가" 로 나오고 있었다
 * (식품 등의 표시·광고에 관한 법률 · 표시·광고의 공정화에 관한 법률 ·
 *  소음·진동관리법 · 초·중등교육법 …). 검색은 이미 정규화로 잡는데
 *  이 화면만 못 잡는 상태였다.
 *
 * 같은 정규화 이름에 문서가 여럿이면(고시에 흔하다) 원문 표기가 정확히
 * 같은 것을 먼저, 그다음 제목이 짧은 것을 고른다 — "시행령" 같은 파생본이
 * 본법을 밀어내지 않게 한다.
 */
export async function findDocumentsByTitles(titles: string[]): Promise<
  Map<
    string,
    {
      id: string;
      externalDocumentId: string;
      currentTitle: string;
      documentType: string;
      currentAgencyName: string | null;
    }
  >
> {
  const keys = [...new Set(titles.map((t) => normalizeQuery(t)))].filter(Boolean);
  if (keys.length === 0) return new Map();

  const rows = await prisma.$queryRaw<
    {
      id: string;
      external_document_id: string;
      current_title: string;
      document_type: string;
      current_agency_name: string | null;
      norm: string;
    }[]
  >`
    SELECT d."id", d."external_document_id", d."current_title",
           d."document_type", d."current_agency_name",
           regexp_replace(d."current_title", ${STRIP_CLASS}, '', 'g') AS norm
    FROM "legal_document" d
    WHERE regexp_replace(d."current_title", ${STRIP_CLASS}, '', 'g') = ANY(${keys})
  `;

  const out = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const prev = out.get(r.norm);
    if (!prev || r.current_title.length < prev.current_title.length) out.set(r.norm, r);
  }

  const byTitle = new Map<string, ReturnType<typeof pick>>();
  function pick(r: (typeof rows)[number]) {
    return {
      id: r.id,
      externalDocumentId: r.external_document_id,
      currentTitle: r.current_title,
      documentType: r.document_type,
      currentAgencyName: r.current_agency_name,
    };
  }
  for (const t of titles) {
    const hit = rows.find((r) => r.current_title === t) ?? out.get(normalizeQuery(t));
    if (hit) byTitle.set(t, pick(hit));
  }
  return byTitle;
}
