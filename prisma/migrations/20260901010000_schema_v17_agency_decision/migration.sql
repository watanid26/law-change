-- 행정기관 결정문(개인정보위 ppc · 공정위 ftc). 새 테이블 둘만 만든다.
-- prisma migrate diff 는 라이브 DB 와의 드리프트 때문에 기존 테이블 DROP 을
-- 포함한 스크립트를 만든다. 손으로 쓴다.

CREATE TABLE IF NOT EXISTS "agency_decision" (
  "id"            TEXT PRIMARY KEY,
  "source"        TEXT NOT NULL,
  "external_id"   TEXT NOT NULL,
  "case_number"   TEXT,
  "title"         TEXT NOT NULL,
  "decided_at"    DATE,
  "disposition"   TEXT,
  "summary"       TEXT,
  "reasoning"     TEXT,
  "meeting_type"  TEXT,
  "decision_type" TEXT,
  "official_url"  TEXT,
  "raw_fields"    JSONB,
  "content_hash"  TEXT NOT NULL,
  "collected_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agency_decision_source_external_id_key"
  ON "agency_decision" ("source", "external_id");
CREATE INDEX IF NOT EXISTS "agency_decision_source_decided_at_idx"
  ON "agency_decision" ("source", "decided_at");

CREATE TABLE IF NOT EXISTS "agency_decision_law" (
  "id"          TEXT PRIMARY KEY,
  "decision_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "cited_title" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agency_decision_law_decision_id_document_id_key"
  ON "agency_decision_law" ("decision_id", "document_id");
CREATE INDEX IF NOT EXISTS "agency_decision_law_document_id_idx"
  ON "agency_decision_law" ("document_id");

ALTER TABLE "agency_decision_law"
  ADD CONSTRAINT "agency_decision_law_decision_id_fkey"
  FOREIGN KEY ("decision_id") REFERENCES "agency_decision"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agency_decision_law"
  ADD CONSTRAINT "agency_decision_law_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "legal_document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
