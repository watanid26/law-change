-- Schema v4: 안정화
-- - sourceVersionId 전역 unique → (documentId, sourceVersionId) 로 축소
-- - BootstrapProgress 신설 (cursor + resume)
-- - AdminAuditLog 신설
-- - CollectorJob 활성 상태 partial unique index (동일 문서 활성 잡 중복 방지)

-- ═══════════════════════════════════════════════════════════════
-- 1. legal_document_version: sourceVersionId 전역 unique 제거 → (documentId, sourceVersionId) 로 이동
-- ═══════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS "legal_document_version_source_version_id_key";
CREATE UNIQUE INDEX "legal_document_version_document_id_source_version_id_key"
  ON "legal_document_version"("document_id", "source_version_id");
CREATE INDEX "legal_document_version_source_version_id_idx"
  ON "legal_document_version"("source_version_id");

-- ═══════════════════════════════════════════════════════════════
-- 2. collector_job: 활성 잡 중복 방지 (partial unique index)
-- 동일 (source_type, source_id, job_type) 에 대해 PENDING/RUNNING/RETRY 상태의 잡은 최대 1개
-- DONE/DEAD/FAILED 는 여러 개 가능 (히스토리)
-- ═══════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "collector_job_active_unique"
  ON "collector_job"("source_type", "source_id", "job_type")
  WHERE "status" IN ('PENDING', 'RUNNING', 'RETRY');

-- ═══════════════════════════════════════════════════════════════
-- 3. bootstrap_progress
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "bootstrap_progress" (
  "id"             TEXT NOT NULL,
  "source_type"    TEXT NOT NULL,
  "scope"          TEXT NOT NULL DEFAULT 'all',
  "cursor_page"    INTEGER NOT NULL DEFAULT 1,
  "total_count"    INTEGER NOT NULL DEFAULT 0,
  "scanned_count"  INTEGER NOT NULL DEFAULT 0,
  "enqueued_count" INTEGER NOT NULL DEFAULT 0,
  "status"         TEXT NOT NULL DEFAULT 'RUNNING',
  "started_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  "finished_at"    TIMESTAMP(3),
  "last_error"     TEXT,

  CONSTRAINT "bootstrap_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bootstrap_progress_source_type_scope_key"
  ON "bootstrap_progress"("source_type", "scope");
CREATE INDEX "bootstrap_progress_status_updated_at_idx"
  ON "bootstrap_progress"("status", "updated_at" DESC);

-- ═══════════════════════════════════════════════════════════════
-- 4. admin_audit_log
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "admin_audit_log" (
  "id"             TEXT NOT NULL,
  "actor"          TEXT NOT NULL,
  "action"         TEXT NOT NULL,
  "target"         TEXT,
  "before_status"  TEXT,
  "after_status"   TEXT,
  "payload"        JSONB,
  "outcome"        TEXT NOT NULL DEFAULT 'success',
  "error_message"  TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log"("created_at" DESC);
CREATE INDEX "admin_audit_log_action_created_at_idx" ON "admin_audit_log"("action", "created_at" DESC);
