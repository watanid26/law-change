-- Schema v3: sourceType/sourceId 통합 + 잡 lock 필드 + 상태 열거형 확장
-- 기존 데이터 보존을 위해 add → backfill → NOT NULL → drop old 순으로 진행.

-- ═══════════════════════════════════════════════════════════════
-- 1. legal_document: source_law_id / source_rule_id → source_type / source_id
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "legal_document"
  ADD COLUMN "source_type" TEXT,
  ADD COLUMN "source_id"   TEXT;

UPDATE "legal_document"
   SET "source_type" = 'LAW',
       "source_id"   = "source_law_id"
 WHERE "source_law_id" IS NOT NULL;

UPDATE "legal_document"
   SET "source_type" = 'ADMIN_RULE',
       "source_id"   = "source_rule_id"
 WHERE "source_rule_id" IS NOT NULL
   AND "source_type" IS NULL;

-- 백필 검증: 모든 행이 채워졌는지
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "legal_document" WHERE "source_type" IS NULL OR "source_id" IS NULL) THEN
    RAISE EXCEPTION 'Migration failed: legal_document has rows without source_type/source_id';
  END IF;
END$$;

ALTER TABLE "legal_document" ALTER COLUMN "source_type" SET NOT NULL;
ALTER TABLE "legal_document" ALTER COLUMN "source_id"   SET NOT NULL;

CREATE UNIQUE INDEX "legal_document_source_type_source_id_key"
  ON "legal_document"("source_type", "source_id");

CREATE INDEX "legal_document_source_type_idx" ON "legal_document"("source_type");

-- 기존 unique 인덱스·컬럼 제거
DROP INDEX IF EXISTS "legal_document_source_law_id_key";
DROP INDEX IF EXISTS "legal_document_source_rule_id_key";
ALTER TABLE "legal_document" DROP COLUMN "source_law_id";
ALTER TABLE "legal_document" DROP COLUMN "source_rule_id";

-- ═══════════════════════════════════════════════════════════════
-- 2. collector_job: source_law_id/source_rule_id → source_type/source_id
--    + lock 필드, 상태 열거형 확장
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "collector_job"
  ADD COLUMN "source_type" TEXT,
  ADD COLUMN "source_id"   TEXT,
  ADD COLUMN "locked_at"   TIMESTAMP(3),
  ADD COLUMN "locked_by"   TEXT,
  ADD COLUMN "started_at"  TIMESTAMP(3),
  ADD COLUMN "finished_at" TIMESTAMP(3);

-- 기존 잡 백필
UPDATE "collector_job"
   SET "source_type" = CASE
                         WHEN "source_law_id"  IS NOT NULL THEN 'LAW'
                         WHEN "source_rule_id" IS NOT NULL THEN 'ADMIN_RULE'
                         ELSE 'LAW' -- 알 수 없는 잡은 LAW로 (실무상 존재 X)
                       END,
       "source_id"   = COALESCE("source_law_id", "source_rule_id", '')
 WHERE "source_type" IS NULL;

-- 완전히 비어있는 잡 (source_id='')은 방치하지 말고 실패로 정리
UPDATE "collector_job"
   SET "status" = 'DEAD',
       "last_error" = 'Migration v3: legacy job with no source id'
 WHERE "source_id" = '';

-- 상태 대문자 정규화 (기존은 소문자 'pending' 등)
UPDATE "collector_job" SET "status" = UPPER("status");

ALTER TABLE "collector_job" ALTER COLUMN "source_type" SET NOT NULL;
ALTER TABLE "collector_job" ALTER COLUMN "source_id"   SET NOT NULL;
ALTER TABLE "collector_job" ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP INDEX IF EXISTS "collector_job_source_law_id_idx";
DROP INDEX IF EXISTS "collector_job_source_rule_id_idx";
ALTER TABLE "collector_job" DROP COLUMN "source_law_id";
ALTER TABLE "collector_job" DROP COLUMN "source_rule_id";

CREATE INDEX "collector_job_source_type_source_id_idx"
  ON "collector_job"("source_type", "source_id");
CREATE INDEX "collector_job_status_locked_at_idx"
  ON "collector_job"("status", "locked_at");

-- job_type 값도 정리 (기존 'DETAIL_LAW' → 'DETAIL')
UPDATE "collector_job" SET "job_type" = 'DETAIL' WHERE "job_type" IN ('DETAIL_LAW','DETAIL_RULE');

-- ═══════════════════════════════════════════════════════════════
-- 3. collector_run: stale_recovered_count 추가
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "collector_run"
  ADD COLUMN "stale_recovered_count" INTEGER NOT NULL DEFAULT 0;
