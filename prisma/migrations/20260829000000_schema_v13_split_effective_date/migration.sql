-- schema v13 — 분할시행(같은 공포건이 시행일 여러 개로 나뉘는 경우) 저장
--
-- 법제처는 같은 공포건(법령일련번호)을 시행일별로 여러 줄 준다.
--   예) 식품위생법 제20898호 — 2025.4.1 시행 / 2028.7.1 시행
-- 유일키가 (document_id, external_version_id) 라 한 줄만 저장되고 나머지가
-- 조용히 버려졌다. 실측(법률·대통령령 60개 무작위 표본):
--   · 분할시행이 있는 법령 36.7%
--   · 버전 행의 6.1% 누락
--   · 그중 결정적인 것 — 법령의 6.7% 가 화면에 "시행 예정 없음" 으로 나오는데
--     실제로는 앞으로 닥칠 시행일이 있었다 (전부 화면 0건 / 실제 1건).
--     미술진흥법 2027.7.26 · 전공의 수련환경법 시행령 2026.12.31 ·
--     제약산업 특별법 시행령 2029.7.22 · 어촌ㆍ어항법 2027.4.22
-- 컴플라이언스 화면이 "대비할 게 없다" 는 방향으로 틀리는 것이라 고친다.
--
-- NULLS NOT DISTINCT (PG 15+):
--   effective_date 는 nullable 이다. 기본 UNIQUE 는 NULL 을 서로 다른 값으로
--   보므로 (doc, version, NULL) 행이 무제한 중복될 수 있다. 현재 NULL 행은
--   0건이지만 제약이 느슨해지는 것을 막는다. 이 DB 는 PostgreSQL 17.6.
--
-- 되돌리기: 아래 두 문장을 반대로 실행하면 된다. 단 그 시점에 분할시행 행이
-- 이미 들어와 있으면 옛 유일키를 다시 만들 수 없다 (중복 충돌).

DROP INDEX IF EXISTS "legal_document_version_document_id_external_version_id_key";

CREATE UNIQUE INDEX "legal_document_version_doc_version_effective_unique"
  ON "legal_document_version" ("document_id", "external_version_id", "effective_date")
  NULLS NOT DISTINCT;
