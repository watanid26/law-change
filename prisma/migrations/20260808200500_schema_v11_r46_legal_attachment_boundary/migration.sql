-- Round 4.6 — LegalAttachment cross-document 결합 차단 (schema v11)
-- v10 이후 legal corpus 전수 audit 결과: LegalAttachment 가 documentVersionId (필수) +
-- contentUnitId (선택) 를 가지지만 두 참조 간 documentId 일치가 DB 로 강제되지 않는다.
--
-- 사전 조건: legal_attachment 테이블 empty (2026-08-08 확인).
-- 데이터 존재 시 backfill 로 document_id 를 documentVersion 에서 복제.

BEGIN;

-- document_id denormalize (documentVersion 으로부터)
ALTER TABLE "legal_attachment" ADD COLUMN IF NOT EXISTS "document_id" TEXT;
UPDATE "legal_attachment" la
   SET "document_id" = dv."document_id"
  FROM "legal_document_version" dv
 WHERE dv."id" = la."document_version_id"
   AND la."document_id" IS NULL;
ALTER TABLE "legal_attachment" ALTER COLUMN "document_id" SET NOT NULL;

-- 기존 단일 FK 제거
ALTER TABLE "legal_attachment" DROP CONSTRAINT IF EXISTS "legal_attachment_document_version_id_fkey";
ALTER TABLE "legal_attachment" DROP CONSTRAINT IF EXISTS "legal_attachment_content_unit_id_fkey";

-- composite FKs: documentVersion + contentUnit 이 같은 document 여야 성립
ALTER TABLE "legal_attachment"
  ADD CONSTRAINT "legal_attachment_document_version_id_document_id_fkey"
  FOREIGN KEY ("document_version_id", "document_id")
  REFERENCES "legal_document_version" ("id", "document_id")
  ON DELETE CASCADE;
ALTER TABLE "legal_attachment"
  ADD CONSTRAINT "legal_attachment_content_unit_id_document_id_fkey"
  FOREIGN KEY ("content_unit_id", "document_id")
  REFERENCES "legal_content_unit" ("id", "document_id")
  ON DELETE SET NULL ("content_unit_id");

CREATE INDEX IF NOT EXISTS "legal_attachment_document_id_idx"
  ON "legal_attachment" ("document_id");

COMMIT;
