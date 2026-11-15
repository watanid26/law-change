-- Schema v5 (Round 4.1)
-- - LegalChangeEvent.discovery_type + notification_eligible
-- - BootstrapProgress: raw/matched 통계 분리 + lock 필드
-- - ReconciliationProgress + ReconciliationSourceSnapshot 신설

-- ═══════════════════════════════════════════════════════════════
-- 1. legal_change_event
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "legal_change_event"
  ADD COLUMN "discovery_type" TEXT NOT NULL DEFAULT 'LIVE_DETECTION',
  ADD COLUMN "notification_eligible" BOOLEAN NOT NULL DEFAULT true;

-- 기존 데이터: bootstrap/시드로 넣은 것들은 HISTORICAL_IMPORT로 표시 + 알림 비활성
-- (사용자 알림 발송 방지)
UPDATE "legal_change_event"
   SET "discovery_type" = 'HISTORICAL_IMPORT',
       "notification_eligible" = false;

-- ═══════════════════════════════════════════════════════════════
-- 2. bootstrap_progress: 통계 분리 + lock
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "bootstrap_progress"
  ADD COLUMN "raw_scanned_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "matched_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "locked_at" TIMESTAMP(3),
  ADD COLUMN "locked_by" TEXT,
  ADD COLUMN "heartbeat_at" TIMESTAMP(3);

-- 기존 scanned_count → raw_scanned_count 로 옮기고 matched_count 는 동일 값 (LAW용은 매칭이 모두)
UPDATE "bootstrap_progress"
   SET "raw_scanned_count" = "scanned_count",
       "matched_count"     = "scanned_count";

-- scanned_count 는 다음 마이그레이션에서 제거 (지금은 코드 호환 위해 유지)

CREATE INDEX "bootstrap_progress_status_heartbeat_at_idx"
  ON "bootstrap_progress"("status", "heartbeat_at");

-- ═══════════════════════════════════════════════════════════════
-- 3. reconciliation_progress + snapshot
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "reconciliation_progress" (
  "id"           TEXT NOT NULL,
  "source_type"  TEXT NOT NULL,
  "session_id"   TEXT NOT NULL,
  "cursor_page"  INTEGER NOT NULL DEFAULT 1,
  "total_count"  INTEGER NOT NULL DEFAULT 0,
  "scanned_count" INTEGER NOT NULL DEFAULT 0,
  "status"       TEXT NOT NULL DEFAULT 'RUNNING',
  "started_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  "finished_at"  TIMESTAMP(3),
  "last_error"   TEXT,
  "locked_at"    TIMESTAMP(3),
  "locked_by"    TEXT,
  "heartbeat_at" TIMESTAMP(3),
  CONSTRAINT "reconciliation_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reconciliation_progress_source_type_session_id_key"
  ON "reconciliation_progress"("source_type", "session_id");
CREATE INDEX "reconciliation_progress_source_type_status_started_at_idx"
  ON "reconciliation_progress"("source_type", "status", "started_at" DESC);

CREATE TABLE "reconciliation_source_snapshot" (
  "id"                TEXT NOT NULL,
  "reconciliation_id" TEXT NOT NULL,
  "source_id"         TEXT NOT NULL,
  CONSTRAINT "reconciliation_source_snapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reconciliation_source_snapshot_reconciliation_id_source_id_key"
  ON "reconciliation_source_snapshot"("reconciliation_id", "source_id");
CREATE INDEX "reconciliation_source_snapshot_reconciliation_id_idx"
  ON "reconciliation_source_snapshot"("reconciliation_id");

ALTER TABLE "reconciliation_source_snapshot"
  ADD CONSTRAINT "reconciliation_source_snapshot_reconciliation_id_fkey"
  FOREIGN KEY ("reconciliation_id") REFERENCES "reconciliation_progress"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
