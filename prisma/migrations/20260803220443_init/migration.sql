-- CreateTable
CREATE TABLE "legal_document" (
    "id" TEXT NOT NULL,
    "source_law_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_type_code" TEXT,
    "title" TEXT NOT NULL,
    "short_title" TEXT,
    "ministry" TEXT,
    "ministry_code" TEXT,
    "official_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_version" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "source_version_id" TEXT NOT NULL,
    "revision_sequence" INTEGER NOT NULL DEFAULT 0,
    "revision_type" TEXT NOT NULL,
    "promulgation_number" TEXT,
    "promulgation_date" TIMESTAMP(3) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "effective_date_note" TEXT,
    "content_hash" TEXT NOT NULL,
    "raw_object_path" TEXT,
    "normalized_content" JSONB,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_updated_at" TIMESTAMP(3),

    CONSTRAINT "legal_document_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_article_version" (
    "id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "article_key" TEXT NOT NULL,
    "article_number" TEXT NOT NULL,
    "article_title" TEXT,
    "article_order" INTEGER NOT NULL,
    "article_text" TEXT NOT NULL,
    "article_hash" TEXT NOT NULL,
    "effective_date" TIMESTAMP(3),
    "is_moved_from" TEXT,
    "is_moved_to" TEXT,

    CONSTRAINT "legal_article_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_change_event" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "previous_version_id" TEXT,
    "new_version_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "promulgation_date" TIMESTAMP(3) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_article_count" INTEGER NOT NULL DEFAULT 0,
    "added_count" INTEGER NOT NULL DEFAULT 0,
    "modified_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "legal_change_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_diff" (
    "id" TEXT NOT NULL,
    "change_event_id" TEXT NOT NULL,
    "article_key" TEXT NOT NULL,
    "article_number" TEXT NOT NULL,
    "article_title" TEXT,
    "change_type" TEXT NOT NULL,
    "old_text" TEXT,
    "new_text" TEXT,
    "diff_operations" JSONB,

    CONSTRAINT "legal_diff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_watch" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "document_id" TEXT NOT NULL,
    "article_key" TEXT,
    "folder_id" TEXT,
    "notification_policy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_watch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collector_run" (
    "id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "metadata" JSONB,

    CONSTRAINT "collector_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_source_law_id_key" ON "legal_document"("source_law_id");

-- CreateIndex
CREATE INDEX "legal_document_document_type_idx" ON "legal_document"("document_type");

-- CreateIndex
CREATE INDEX "legal_document_ministry_code_idx" ON "legal_document"("ministry_code");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_version_source_version_id_key" ON "legal_document_version"("source_version_id");

-- CreateIndex
CREATE INDEX "legal_document_version_document_id_promulgation_date_idx" ON "legal_document_version"("document_id", "promulgation_date" DESC);

-- CreateIndex
CREATE INDEX "legal_document_version_effective_date_idx" ON "legal_document_version"("effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_version_document_id_promulgation_number_key" ON "legal_document_version"("document_id", "promulgation_number");

-- CreateIndex
CREATE INDEX "legal_article_version_article_hash_idx" ON "legal_article_version"("article_hash");

-- CreateIndex
CREATE UNIQUE INDEX "legal_article_version_document_version_id_article_key_key" ON "legal_article_version"("document_version_id", "article_key");

-- CreateIndex
CREATE INDEX "legal_change_event_document_id_promulgation_date_idx" ON "legal_change_event"("document_id", "promulgation_date" DESC);

-- CreateIndex
CREATE INDEX "legal_change_event_effective_date_idx" ON "legal_change_event"("effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "legal_change_event_new_version_id_key" ON "legal_change_event"("new_version_id");

-- CreateIndex
CREATE INDEX "legal_diff_change_event_id_article_key_idx" ON "legal_diff"("change_event_id", "article_key");

-- CreateIndex
CREATE INDEX "user_watch_user_id_idx" ON "user_watch"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_watch_user_id_document_id_article_key_key" ON "user_watch"("user_id", "document_id", "article_key");

-- CreateIndex
CREATE INDEX "collector_run_job_type_started_at_idx" ON "collector_run"("job_type", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "legal_document_version" ADD CONSTRAINT "legal_document_version_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_article_version" ADD CONSTRAINT "legal_article_version_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "legal_document_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_change_event" ADD CONSTRAINT "legal_change_event_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_change_event" ADD CONSTRAINT "legal_change_event_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "legal_document_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_change_event" ADD CONSTRAINT "legal_change_event_new_version_id_fkey" FOREIGN KEY ("new_version_id") REFERENCES "legal_document_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_diff" ADD CONSTRAINT "legal_diff_change_event_id_fkey" FOREIGN KEY ("change_event_id") REFERENCES "legal_change_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_watch" ADD CONSTRAINT "user_watch_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
