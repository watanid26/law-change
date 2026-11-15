-- Schema v2 improvements
-- - collector_run.total_count → 세분화된 카운트 필드로 대체 (dev 데이터 1행 유실 감수)
-- - legal_document_version.effective_date_note → effective_date_text 로 rename (데이터 보존)
-- - 고시 필드 추가 (issuance_date/issuance_number, source_rule_id)
-- - promulgation_date, effective_date nullable 완화
-- - user 기능 테이블 신설

-- DropIndex (null promulgation_number에 의존하던 unique key 제거)
DROP INDEX "legal_document_version_document_id_promulgation_number_key";

-- AlterTable: collector_run (total_count 제거, 세분화 필드 추가)
ALTER TABLE "collector_run" DROP COLUMN "total_count",
ADD COLUMN     "changed_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "new_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scanned_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: legal_change_event (issuance_date, effective_date_text, moved_count 추가; date nullable)
ALTER TABLE "legal_change_event" ADD COLUMN     "effective_date_text" TEXT,
ADD COLUMN     "issuance_date" TIMESTAMP(3),
ADD COLUMN     "moved_count" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "promulgation_date" DROP NOT NULL,
ALTER COLUMN "effective_date" DROP NOT NULL;

-- AlterTable: legal_document (고시 ID)
ALTER TABLE "legal_document" ADD COLUMN     "source_rule_id" TEXT;

-- AlterTable: legal_document_version — effective_date_note → effective_date_text 로 RENAME (데이터 보존)
ALTER TABLE "legal_document_version" RENAME COLUMN "effective_date_note" TO "effective_date_text";
ALTER TABLE "legal_document_version"
  ADD COLUMN "issuance_date" TIMESTAMP(3),
  ADD COLUMN "issuance_number" TEXT,
  ALTER COLUMN "promulgation_date" DROP NOT NULL,
  ALTER COLUMN "effective_date" DROP NOT NULL;

-- CreateTable
CREATE TABLE "collector_job" (
    "id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "source_law_id" TEXT,
    "source_rule_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collector_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "role" TEXT NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_folder" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_record" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "change_event_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNREAD',
    "reviewed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memo" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "document_id" TEXT,
    "change_event_id" TEXT,
    "article_key" TEXT,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_item" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "change_event_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "change_event_id" TEXT NOT NULL,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "change_event_id" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collector_job_status_next_run_at_idx" ON "collector_job"("status", "next_run_at");
CREATE INDEX "collector_job_source_law_id_idx" ON "collector_job"("source_law_id");
CREATE INDEX "collector_job_source_rule_id_idx" ON "collector_job"("source_rule_id");
CREATE UNIQUE INDEX "user_profile_email_key" ON "user_profile"("email");
CREATE UNIQUE INDEX "user_folder_user_id_name_key" ON "user_folder"("user_id", "name");
CREATE INDEX "review_record_user_id_status_idx" ON "review_record"("user_id", "status");
CREATE UNIQUE INDEX "review_record_user_id_change_event_id_key" ON "review_record"("user_id", "change_event_id");
CREATE INDEX "memo_user_id_updated_at_idx" ON "memo"("user_id", "updated_at" DESC);
CREATE INDEX "memo_document_id_idx" ON "memo"("document_id");
CREATE INDEX "memo_change_event_id_idx" ON "memo"("change_event_id");
CREATE INDEX "checklist_item_user_id_change_event_id_idx" ON "checklist_item"("user_id", "change_event_id");
CREATE INDEX "reminder_status_remind_at_idx" ON "reminder"("status", "remind_at");
CREATE INDEX "reminder_user_id_idx" ON "reminder"("user_id");
CREATE INDEX "notification_user_id_created_at_idx" ON "notification"("user_id", "created_at" DESC);
CREATE INDEX "collector_run_status_started_at_idx" ON "collector_run"("status", "started_at" DESC);
CREATE INDEX "legal_change_event_document_id_issuance_date_idx" ON "legal_change_event"("document_id", "issuance_date" DESC);
CREATE INDEX "legal_change_event_detected_at_idx" ON "legal_change_event"("detected_at" DESC);
CREATE INDEX "legal_diff_change_type_idx" ON "legal_diff"("change_type");
CREATE UNIQUE INDEX "legal_document_source_rule_id_key" ON "legal_document"("source_rule_id");
CREATE INDEX "legal_document_title_idx" ON "legal_document"("title");
CREATE INDEX "legal_document_last_checked_at_idx" ON "legal_document"("last_checked_at");
CREATE INDEX "legal_document_version_document_id_issuance_date_idx" ON "legal_document_version"("document_id", "issuance_date" DESC);
CREATE INDEX "legal_document_version_content_hash_idx" ON "legal_document_version"("content_hash");
CREATE INDEX "user_watch_document_id_idx" ON "user_watch"("document_id");

-- AddForeignKey
ALTER TABLE "user_folder" ADD CONSTRAINT "user_folder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_watch" ADD CONSTRAINT "user_watch_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_watch" ADD CONSTRAINT "user_watch_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "user_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "review_record" ADD CONSTRAINT "review_record_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_record" ADD CONSTRAINT "review_record_change_event_id_fkey" FOREIGN KEY ("change_event_id") REFERENCES "legal_change_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memo" ADD CONSTRAINT "memo_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memo" ADD CONSTRAINT "memo_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memo" ADD CONSTRAINT "memo_change_event_id_fkey" FOREIGN KEY ("change_event_id") REFERENCES "legal_change_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_change_event_id_fkey" FOREIGN KEY ("change_event_id") REFERENCES "legal_change_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_change_event_id_fkey" FOREIGN KEY ("change_event_id") REFERENCES "legal_change_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
