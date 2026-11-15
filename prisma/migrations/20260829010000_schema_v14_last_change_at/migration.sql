-- schema v14 — 문서의 최신 개정일을 컬럼으로 내린다
--
-- 목록의 기본 정렬(최근 개정순)이 legal_document_version 에 LATERAL 로
-- 물어보고 있었다. 문서마다 한 번씩 도느라 문서 수에 선형으로 느려진다.
--   실측  15,850건 161ms → 24,527건 330ms
--   EXPLAIN  Nested Loop Left Join, LATERAL loops=24527,
--            buffer 151,154 중 150,226 이 LATERAL 몫
-- 행정규칙까지 받으면 문서가 28,000을 넘으므로 그대로 두면 계속 나빠진다.
--
-- 값은 MAX(공포일, 발령일). GREATEST 는 NULL 을 무시하고 최댓값을 준다
-- (전부 NULL 일 때만 NULL).

ALTER TABLE "legal_document" ADD COLUMN "last_change_at" TIMESTAMP(3);

UPDATE "legal_document" d
SET "last_change_at" = v.last_change
FROM (
  SELECT document_id,
         GREATEST(MAX(promulgation_date), MAX(issuance_date)) AS last_change
  FROM "legal_document_version"
  GROUP BY document_id
) v
WHERE v.document_id = d."id";

CREATE INDEX "legal_document_last_change_at_idx"
  ON "legal_document" ("last_change_at" DESC);
