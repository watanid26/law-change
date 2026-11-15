-- 법령해석례(법제처 expc) 수집. 새 테이블 둘만 만든다.
-- prisma migrate diff 는 라이브 DB 와의 드리프트 때문에 기존 테이블 DROP 을
-- 포함한 스크립트를 만든다. 손으로 쓴다.

CREATE TABLE IF NOT EXISTS "legal_interpretation" (
  "id"                  TEXT PRIMARY KEY,
  "external_id"         TEXT NOT NULL,
  "case_number"         TEXT,
  "title"               TEXT NOT NULL,
  "question"            TEXT,
  "answer"              TEXT,
  "reasoning"           TEXT,
  "interpreted_at"      DATE,
  "registered_at"       DATE,
  "reply_agency_name"   TEXT,
  "reply_agency_code"   TEXT,
  "inquiry_agency_name" TEXT,
  "inquiry_agency_code" TEXT,
  "official_url"        TEXT,
  "content_hash"        TEXT NOT NULL,
  "collected_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "legal_interpretation_external_id_key"
  ON "legal_interpretation" ("external_id");
CREATE INDEX IF NOT EXISTS "legal_interpretation_interpreted_at_idx"
  ON "legal_interpretation" ("interpreted_at");
CREATE INDEX IF NOT EXISTS "legal_interpretation_registered_at_idx"
  ON "legal_interpretation" ("registered_at");

CREATE TABLE IF NOT EXISTS "legal_interpretation_law" (
  "id"                TEXT PRIMARY KEY,
  "interpretation_id" TEXT NOT NULL,
  "document_id"       TEXT NOT NULL,
  "cited_title"       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "legal_interpretation_law_interpretation_id_document_id_key"
  ON "legal_interpretation_law" ("interpretation_id", "document_id");
CREATE INDEX IF NOT EXISTS "legal_interpretation_law_document_id_idx"
  ON "legal_interpretation_law" ("document_id");

ALTER TABLE "legal_interpretation_law"
  ADD CONSTRAINT "legal_interpretation_law_interpretation_id_fkey"
  FOREIGN KEY ("interpretation_id") REFERENCES "legal_interpretation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "legal_interpretation_law"
  ADD CONSTRAINT "legal_interpretation_law_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "legal_document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
