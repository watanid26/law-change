-- schema v15 — 조문 제목을 legal_content_unit 으로 내린다
--
-- 규칙 기반 개정 신호("바뀐 조문이 벌칙 조문인가")를 내려면 diff 마다 조문
-- 제목이 필요하다. 그런데 legal_diff 에서 제목까지 가는 길이 없다.
--   new/old_content_unit_version_id  1,154,799행 중 채워진 것 0
--   content_unit_id                  1,154,799행 전부 채워짐
-- content_unit_id 로 버전 테이블을 뒤지면 유일키가
-- (document_version_id, content_unit_id) 라 앞 컬럼이 없어 인덱스를 못 타고
-- statement timeout 이 난다.
--
-- 조문 제목은 개정으로 잘 바뀌지 않는다. "현재 제목" 을 유닛에 둔다.
-- 값은 그 유닛의 가장 최근 버전 제목.

ALTER TABLE "legal_content_unit" ADD COLUMN "current_title" TEXT;

UPDATE "legal_content_unit" cu
SET "current_title" = v.unit_title
FROM (
  SELECT DISTINCT ON (content_unit_id) content_unit_id, unit_title
  FROM "legal_content_unit_version"
  WHERE unit_title IS NOT NULL
  ORDER BY content_unit_id, id DESC
) v
WHERE v.content_unit_id = cu."id";
