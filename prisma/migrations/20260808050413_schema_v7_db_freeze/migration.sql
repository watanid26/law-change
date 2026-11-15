-- Schema v7 — Round 4.4 DB Freeze
-- 사용자 기능 도메인 뼈대 확정. Auth 이후에 FK 뒤흔들지 않도록 이 라운드에서 이관.
-- 데이터 보존: legal_document, legal_document_version, legal_change_event, legal_diff, legal_article_version
-- 데이터 폐기: user_* / memo / checklist_item / reminder / notification (모두 0건 확인됨)

-- ═══════════════════════════════════════════════════════════════
-- 0. 사용하지 않는 사용자 테이블 삭제 (모두 empty)
-- ═══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS "notification" CASCADE;
DROP TABLE IF EXISTS "reminder" CASCADE;
DROP TABLE IF EXISTS "checklist_item" CASCADE;
DROP TABLE IF EXISTS "memo" CASCADE;
DROP TABLE IF EXISTS "review_record" CASCADE;
DROP TABLE IF EXISTS "user_watch" CASCADE;
DROP TABLE IF EXISTS "user_folder" CASCADE;
DROP TABLE IF EXISTS "user_profile" CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- 1. LegalSource 신설 + 시드
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "legal_source" (
  "id"                TEXT NOT NULL,
  "jurisdiction_code" TEXT NOT NULL,
  "provider_code"     TEXT NOT NULL,
  "source_type"       TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "enabled"           BOOLEAN NOT NULL DEFAULT true,
  "base_url"          TEXT,
  "metadata"          JSONB,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_source_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legal_source_jurisdiction_provider_type_key"
  ON "legal_source"("jurisdiction_code", "provider_code", "source_type");

-- 기본 소스 2건
INSERT INTO "legal_source" ("id", "jurisdiction_code", "provider_code", "source_type", "name", "base_url") VALUES
  ('src_kr_moleg_law',  'KR', 'KR_MOLEG', 'LAW',        '법제처 국가법령정보 - 법령',  'https://www.law.go.kr/DRF'),
  ('src_kr_moleg_rule', 'KR', 'KR_MOLEG', 'ADMIN_RULE', '법제처 국가법령정보 - 행정규칙','https://www.law.go.kr/DRF');

-- ═══════════════════════════════════════════════════════════════
-- 2. legal_document 리모델
--    source_type/source_id → legal_source_id + external_document_id
--    title/ministry/ministry_code → current_title/current_agency_name/current_agency_code
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "legal_document"
  ADD COLUMN "legal_source_id"       TEXT,
  ADD COLUMN "external_document_id"  TEXT,
  ADD COLUMN "current_title"         TEXT,
  ADD COLUMN "current_short_title"   TEXT,
  ADD COLUMN "current_agency_name"   TEXT,
  ADD COLUMN "current_agency_code"   TEXT,
  ADD COLUMN "current_version_id"    TEXT,
  ADD COLUMN "last_seen_at"          TIMESTAMP(3),
  ADD COLUMN "repealed_at"           TIMESTAMP(3),
  ADD COLUMN "metadata"              JSONB,
  ADD COLUMN "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "legal_document"
   SET "legal_source_id" = CASE
        WHEN "source_type" = 'LAW'        THEN 'src_kr_moleg_law'
        WHEN "source_type" = 'ADMIN_RULE' THEN 'src_kr_moleg_rule'
      END,
       "external_document_id" = "source_id",
       "current_title"         = "title",
       "current_short_title"   = "short_title",
       "current_agency_name"   = "ministry",
       "current_agency_code"   = "ministry_code",
       "last_seen_at"          = "last_checked_at";

-- 상태값 대문자 정규화 (기존 'active' → 'ACTIVE')
UPDATE "legal_document" SET "status" = UPPER("status");

ALTER TABLE "legal_document"
  ALTER COLUMN "legal_source_id"      SET NOT NULL,
  ALTER COLUMN "external_document_id" SET NOT NULL,
  ALTER COLUMN "current_title"        SET NOT NULL,
  ALTER COLUMN "last_seen_at"         SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- FK + Unique
ALTER TABLE "legal_document"
  ADD CONSTRAINT "legal_document_legal_source_id_fkey"
  FOREIGN KEY ("legal_source_id") REFERENCES "legal_source"("id") ON UPDATE CASCADE;

CREATE UNIQUE INDEX "legal_document_legal_source_id_external_document_id_key"
  ON "legal_document"("legal_source_id", "external_document_id");
CREATE INDEX "legal_document_legal_source_id_idx" ON "legal_document"("legal_source_id");
CREATE INDEX "legal_document_current_agency_code_idx" ON "legal_document"("current_agency_code");
CREATE INDEX "legal_document_current_title_idx" ON "legal_document"("current_title");
CREATE INDEX "legal_document_status_idx" ON "legal_document"("status");

-- 구 인덱스·컬럼 정리
DROP INDEX IF EXISTS "legal_document_source_type_source_id_key";
DROP INDEX IF EXISTS "legal_document_source_type_idx";
DROP INDEX IF EXISTS "legal_document_ministry_code_idx";
DROP INDEX IF EXISTS "legal_document_title_idx";

ALTER TABLE "legal_document"
  DROP COLUMN "source_type",
  DROP COLUMN "source_id",
  DROP COLUMN "title",
  DROP COLUMN "short_title",
  DROP COLUMN "ministry",
  DROP COLUMN "ministry_code";

-- ═══════════════════════════════════════════════════════════════
-- 3. legal_document_version — sourceVersionId → externalVersionId + snapshot 필드
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "legal_document_version" RENAME COLUMN "source_version_id" TO "external_version_id";

-- 인덱스 이름도 갱신 (있으면)
DROP INDEX IF EXISTS "legal_document_version_source_version_id_idx";
DROP INDEX IF EXISTS "legal_document_version_document_id_source_version_id_key";

CREATE UNIQUE INDEX "legal_document_version_document_id_external_version_id_key"
  ON "legal_document_version"("document_id", "external_version_id");
CREATE INDEX "legal_document_version_external_version_id_idx"
  ON "legal_document_version"("external_version_id");

ALTER TABLE "legal_document_version"
  ADD COLUMN "title_snapshot"          TEXT,
  ADD COLUMN "agency_name_snapshot"    TEXT,
  ADD COLUMN "agency_code_snapshot"    TEXT,
  ADD COLUMN "status_snapshot"         TEXT,
  ADD COLUMN "parser_version"          TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN "normalization_version"   TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ═══════════════════════════════════════════════════════════════
-- 4. legal_content_unit + legal_content_unit_version 신설 + article_version 이관
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "legal_content_unit" (
  "id"                     TEXT NOT NULL,
  "document_id"            TEXT NOT NULL,
  "unit_type"              TEXT NOT NULL,
  "canonical_key"          TEXT NOT NULL,
  "current_label"          TEXT,
  "first_seen_version_id"  TEXT,
  "last_seen_version_id"   TEXT,
  "status"                 TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_content_unit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_content_unit_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "legal_content_unit_document_id_unit_type_canonical_key_key"
  ON "legal_content_unit"("document_id", "unit_type", "canonical_key");
CREATE INDEX "legal_content_unit_document_id_unit_type_idx"
  ON "legal_content_unit"("document_id", "unit_type");

CREATE TABLE "legal_content_unit_version" (
  "id"                    TEXT NOT NULL,
  "content_unit_id"       TEXT NOT NULL,
  "document_version_id"   TEXT NOT NULL,
  "source_key"            TEXT NOT NULL,
  "unit_number"           TEXT,
  "unit_title"            TEXT,
  "unit_order"            INTEGER NOT NULL,
  "content_text"          TEXT NOT NULL,
  "content_hash"          TEXT NOT NULL,
  "effective_date"        TIMESTAMP(3),
  "metadata"              JSONB,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_content_unit_version_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_content_unit_version_content_unit_id_fkey"
    FOREIGN KEY ("content_unit_id") REFERENCES "legal_content_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "legal_content_unit_version_document_version_id_fkey"
    FOREIGN KEY ("document_version_id") REFERENCES "legal_document_version"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "legal_content_unit_version_document_version_content_unit_key"
  ON "legal_content_unit_version"("document_version_id", "content_unit_id");
CREATE INDEX "legal_content_unit_version_content_unit_id_idx"
  ON "legal_content_unit_version"("content_unit_id");
CREATE INDEX "legal_content_unit_version_content_hash_idx"
  ON "legal_content_unit_version"("content_hash");
CREATE INDEX "legal_content_unit_version_document_version_id_unit_order_idx"
  ON "legal_content_unit_version"("document_version_id", "unit_order");

-- Backfill: 각 (document_id, article_key)마다 legal_content_unit 1개 (ARTICLE 타입)
-- article_key로 그룹핑, 라벨은 가장 최근 article_number 사용
INSERT INTO "legal_content_unit" ("id", "document_id", "unit_type", "canonical_key", "current_label", "status")
SELECT
  'cu_' || substr(md5(dv.document_id || ':' || av.article_key), 1, 20),
  dv.document_id,
  'ARTICLE',
  av.article_key,
  MAX(av.article_number),
  'ACTIVE'
FROM "legal_article_version" av
JOIN "legal_document_version" dv ON dv.id = av.document_version_id
GROUP BY dv.document_id, av.article_key;

-- 각 article_version row → content_unit_version
INSERT INTO "legal_content_unit_version" (
  "id", "content_unit_id", "document_version_id", "source_key",
  "unit_number", "unit_title", "unit_order",
  "content_text", "content_hash", "effective_date"
)
SELECT
  'cuv_' || substr(md5(av.id), 1, 20),
  cu.id,
  av.document_version_id,
  av.article_key,
  av.article_number,
  av.article_title,
  av.article_order,
  av.article_text,
  av.article_hash,
  av.effective_date
FROM "legal_article_version" av
JOIN "legal_document_version" dv ON dv.id = av.document_version_id
JOIN "legal_content_unit" cu
  ON cu.document_id = dv.document_id
 AND cu.canonical_key = av.article_key
 AND cu.unit_type = 'ARTICLE';

-- ═══════════════════════════════════════════════════════════════
-- 5. legal_attachment 신설 (빈 테이블)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "legal_attachment" (
  "id"                  TEXT NOT NULL,
  "document_version_id" TEXT NOT NULL,
  "content_unit_id"     TEXT,
  "attachment_type"     TEXT NOT NULL,
  "source_url"          TEXT,
  "object_path"         TEXT,
  "file_name"           TEXT,
  "mime_type"           TEXT,
  "file_size"           INTEGER,
  "content_hash"        TEXT,
  "collected_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata"            JSONB,
  CONSTRAINT "legal_attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_attachment_document_version_id_fkey"
    FOREIGN KEY ("document_version_id") REFERENCES "legal_document_version"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "legal_attachment_content_unit_id_fkey"
    FOREIGN KEY ("content_unit_id") REFERENCES "legal_content_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "legal_attachment_document_version_id_idx" ON "legal_attachment"("document_version_id");

-- ═══════════════════════════════════════════════════════════════
-- 6. legal_change_event — totalDiffCount, contentTypeSummary 추가 + status 대문자
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "legal_change_event"
  ADD COLUMN "total_diff_count"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "content_type_summary"  JSONB,
  ADD COLUMN "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 기존 changedArticleCount 값을 totalDiffCount로 복사
UPDATE "legal_change_event" SET "total_diff_count" = "changed_article_count";

-- 이후 changed_article_count는 legacy로 두거나 drop. drop이 깔끔.
ALTER TABLE "legal_change_event" DROP COLUMN "changed_article_count";

-- 상태값 대문자 정규화
UPDATE "legal_change_event" SET "status" = UPPER("status");
ALTER TABLE "legal_change_event" ALTER COLUMN "status" SET DEFAULT 'PUBLISHED';

-- ═══════════════════════════════════════════════════════════════
-- 7. legal_diff — articleKey/articleNumber/articleTitle → contentUnitId + oldLabel/newLabel + unitType
--    changeType 값 정규화 (ARTICLE_ADDED → ADDED 등)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "legal_diff"
  ADD COLUMN "content_unit_id"                TEXT,
  ADD COLUMN "old_content_unit_version_id"    TEXT,
  ADD COLUMN "new_content_unit_version_id"    TEXT,
  ADD COLUMN "unit_type"                      TEXT NOT NULL DEFAULT 'ARTICLE',
  ADD COLUMN "old_label"                      TEXT,
  ADD COLUMN "new_label"                      TEXT,
  ADD COLUMN "created_at"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- contentUnitId 백필: (event의 document, diff의 article_key) → content_unit.id
-- Postgres UPDATE ... FROM: target table alias는 FROM의 JOIN 조건에서 참조 불가 → WHERE로 이동
UPDATE "legal_diff" ld
   SET "content_unit_id" = cu.id,
       "unit_type"       = 'ARTICLE'
  FROM "legal_change_event" ce,
       "legal_content_unit" cu
 WHERE ld.change_event_id = ce.id
   AND cu.document_id     = ce.document_id
   AND cu.canonical_key   = ld.article_key
   AND cu.unit_type       = 'ARTICLE';

-- 라벨: 기존 article_number/article_title을 old/new에 복사
UPDATE "legal_diff" SET "old_label" = "article_number", "new_label" = "article_number";

-- changeType 값 정규화
UPDATE "legal_diff" SET "change_type" = 'ADDED'    WHERE "change_type" = 'ARTICLE_ADDED';
UPDATE "legal_diff" SET "change_type" = 'DELETED'  WHERE "change_type" = 'ARTICLE_DELETED';
UPDATE "legal_diff" SET "change_type" = 'MODIFIED' WHERE "change_type" = 'ARTICLE_MODIFIED';
UPDATE "legal_diff" SET "change_type" = 'MOVED'    WHERE "change_type" = 'ARTICLE_MOVED';

-- FK
ALTER TABLE "legal_diff"
  ADD CONSTRAINT "legal_diff_content_unit_id_fkey"
  FOREIGN KEY ("content_unit_id") REFERENCES "legal_content_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "legal_diff"
  ADD CONSTRAINT "legal_diff_old_content_unit_version_id_fkey"
  FOREIGN KEY ("old_content_unit_version_id") REFERENCES "legal_content_unit_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "legal_diff"
  ADD CONSTRAINT "legal_diff_new_content_unit_version_id_fkey"
  FOREIGN KEY ("new_content_unit_version_id") REFERENCES "legal_content_unit_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 구 인덱스·컬럼 정리
DROP INDEX IF EXISTS "legal_diff_change_event_id_article_key_idx";
CREATE INDEX "legal_diff_change_event_id_unit_type_idx" ON "legal_diff"("change_event_id", "unit_type");
CREATE INDEX "legal_diff_content_unit_id_idx" ON "legal_diff"("content_unit_id");

ALTER TABLE "legal_diff"
  DROP COLUMN "article_key",
  DROP COLUMN "article_number",
  DROP COLUMN "article_title";

-- ═══════════════════════════════════════════════════════════════
-- 8. legal_article_version 폐기 (content_unit_* 로 이관 완료)
-- ═══════════════════════════════════════════════════════════════
DROP TABLE "legal_article_version";

-- ═══════════════════════════════════════════════════════════════
-- 9. Workspace / Auth
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "app_user" (
  "id"           TEXT NOT NULL,
  "email"        TEXT,
  "display_name" TEXT,
  "status"       TEXT NOT NULL DEFAULT 'ACTIVE',
  "locale"       TEXT NOT NULL DEFAULT 'ko-KR',
  "timezone"     TEXT NOT NULL DEFAULT 'Asia/Seoul',
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"   TIMESTAMP(3),
  CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "app_user_email_idx" ON "app_user"("email");

CREATE TABLE "auth_identity" (
  "id"               TEXT NOT NULL,
  "user_id"          TEXT NOT NULL,
  "provider"         TEXT NOT NULL,
  "provider_subject" TEXT NOT NULL,
  "email"            TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_login_at"    TIMESTAMP(3),
  CONSTRAINT "auth_identity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_identity_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "auth_identity_provider_provider_subject_key"
  ON "auth_identity"("provider", "provider_subject");
CREATE INDEX "auth_identity_user_id_idx" ON "auth_identity"("user_id");

CREATE TABLE "workspace" (
  "id"          TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "slug"        TEXT,
  "status"      TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workspace_slug_key" ON "workspace"("slug");
CREATE INDEX "workspace_status_idx" ON "workspace"("status");

CREATE TABLE "workspace_member" (
  "id"           TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "user_id"      TEXT NOT NULL,
  "role"         TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'ACTIVE',
  "joined_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_member_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_member_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_member_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "workspace_member_workspace_id_user_id_key" ON "workspace_member"("workspace_id", "user_id");
CREATE INDEX "workspace_member_user_id_status_idx" ON "workspace_member"("user_id", "status");

CREATE TABLE "workspace_invitation" (
  "id"                   TEXT NOT NULL,
  "workspace_id"         TEXT NOT NULL,
  "email"                TEXT NOT NULL,
  "role"                 TEXT NOT NULL,
  "token_hash"           TEXT NOT NULL,
  "invited_by_user_id"   TEXT NOT NULL,
  "expires_at"           TIMESTAMP(3) NOT NULL,
  "accepted_at"          TIMESTAMP(3),
  "revoked_at"           TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_invitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_invitation_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_invitation_invited_by_user_id_fkey"
    FOREIGN KEY ("invited_by_user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "workspace_invitation_token_hash_key" ON "workspace_invitation"("token_hash");
CREATE INDEX "workspace_invitation_workspace_id_accepted_at_idx" ON "workspace_invitation"("workspace_id", "accepted_at");
CREATE INDEX "workspace_invitation_email_idx" ON "workspace_invitation"("email");

-- ═══════════════════════════════════════════════════════════════
-- 10. Folder / Watch / WatchContentScope
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "folder" (
  "id"           TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "parent_id"    TEXT,
  "name"         TEXT NOT NULL,
  "color"        TEXT,
  "sort_order"   INTEGER NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at"  TIMESTAMP(3),
  CONSTRAINT "folder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "folder_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "folder_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "folder"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "folder_workspace_id_archived_at_idx" ON "folder"("workspace_id", "archived_at");

CREATE TABLE "watch" (
  "id"                             TEXT NOT NULL,
  "workspace_id"                   TEXT NOT NULL,
  "document_id"                    TEXT NOT NULL,
  "folder_id"                      TEXT,
  "status"                         TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_by_member_id"           TEXT NOT NULL,
  "notify_in_app"                  BOOLEAN NOT NULL DEFAULT true,
  "notify_email"                   BOOLEAN NOT NULL DEFAULT false,
  "notify_on_change"               BOOLEAN NOT NULL DEFAULT true,
  "notify_before_effective_days"   JSONB,
  "created_at"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at"                    TIMESTAMP(3),
  CONSTRAINT "watch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "watch_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "watch_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "watch_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "watch_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "workspace_member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "watch_workspace_id_document_id_key" ON "watch"("workspace_id", "document_id");
CREATE INDEX "watch_workspace_id_status_idx" ON "watch"("workspace_id", "status");
CREATE INDEX "watch_document_id_status_idx" ON "watch"("document_id", "status");

CREATE TABLE "watch_content_scope" (
  "id"              TEXT NOT NULL,
  "watch_id"        TEXT NOT NULL,
  "content_unit_id" TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "watch_content_scope_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "watch_content_scope_watch_id_fkey" FOREIGN KEY ("watch_id") REFERENCES "watch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "watch_content_scope_watch_id_content_unit_id_key" ON "watch_content_scope"("watch_id", "content_unit_id");
CREATE INDEX "watch_content_scope_content_unit_id_idx" ON "watch_content_scope"("content_unit_id");

-- ═══════════════════════════════════════════════════════════════
-- 11. ChangeInboxItem / Task / Notes
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "change_inbox_item" (
  "id"                     TEXT NOT NULL,
  "workspace_id"           TEXT NOT NULL,
  "change_event_id"        TEXT NOT NULL,
  "watch_id"               TEXT,
  "status"                 TEXT NOT NULL DEFAULT 'NEW',
  "applicability"          TEXT NOT NULL DEFAULT 'UNKNOWN',
  "priority"               TEXT NOT NULL DEFAULT 'NORMAL',
  "assigned_to_member_id"  TEXT,
  "due_at"                 TIMESTAMP(3),
  "first_notified_at"      TIMESTAMP(3),
  "opened_at"              TIMESTAMP(3),
  "reviewed_at"            TIMESTAMP(3),
  "completed_at"           TIMESTAMP(3),
  "dismissed_at"           TIMESTAMP(3),
  "archived_at"            TIMESTAMP(3),
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "change_inbox_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "change_inbox_item_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "change_inbox_item_change_event_id_fkey" FOREIGN KEY ("change_event_id") REFERENCES "legal_change_event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "change_inbox_item_watch_id_fkey" FOREIGN KEY ("watch_id") REFERENCES "watch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "change_inbox_item_assigned_to_member_id_fkey" FOREIGN KEY ("assigned_to_member_id") REFERENCES "workspace_member"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "change_inbox_item_workspace_id_change_event_id_key" ON "change_inbox_item"("workspace_id", "change_event_id");
CREATE INDEX "change_inbox_item_workspace_id_status_created_at_idx" ON "change_inbox_item"("workspace_id", "status", "created_at" DESC);
CREATE INDEX "change_inbox_item_workspace_id_due_at_idx" ON "change_inbox_item"("workspace_id", "due_at");
CREATE INDEX "change_inbox_item_assigned_to_member_id_status_idx" ON "change_inbox_item"("assigned_to_member_id", "status");
CREATE INDEX "change_inbox_item_change_event_id_idx" ON "change_inbox_item"("change_event_id");

CREATE TABLE "task" (
  "id"                    TEXT NOT NULL,
  "workspace_id"          TEXT NOT NULL,
  "inbox_item_id"         TEXT,
  "title"                 TEXT NOT NULL,
  "description"           TEXT,
  "status"                TEXT NOT NULL DEFAULT 'TODO',
  "priority"              TEXT NOT NULL DEFAULT 'NORMAL',
  "assignee_member_id"    TEXT,
  "created_by_member_id"  TEXT NOT NULL,
  "due_at"                TIMESTAMP(3),
  "started_at"            TIMESTAMP(3),
  "completed_at"          TIMESTAMP(3),
  "sort_order"            INTEGER NOT NULL DEFAULT 0,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at"           TIMESTAMP(3),
  CONSTRAINT "task_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "change_inbox_item"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "task_assignee_member_id_fkey" FOREIGN KEY ("assignee_member_id") REFERENCES "workspace_member"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "task_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "workspace_member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "task_workspace_id_status_due_at_idx" ON "task"("workspace_id", "status", "due_at");
CREATE INDEX "task_assignee_member_id_status_idx" ON "task"("assignee_member_id", "status");
CREATE INDEX "task_inbox_item_id_idx" ON "task"("inbox_item_id");

CREATE TABLE "document_note" (
  "id"                TEXT NOT NULL,
  "workspace_id"      TEXT NOT NULL,
  "document_id"       TEXT NOT NULL,
  "author_member_id"  TEXT NOT NULL,
  "content"           TEXT NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"        TIMESTAMP(3),
  CONSTRAINT "document_note_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_note_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_note_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_note_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "workspace_member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "document_note_workspace_id_document_id_deleted_at_idx" ON "document_note"("workspace_id", "document_id", "deleted_at");

CREATE TABLE "inbox_note" (
  "id"                TEXT NOT NULL,
  "workspace_id"      TEXT NOT NULL,
  "inbox_item_id"     TEXT NOT NULL,
  "author_member_id"  TEXT NOT NULL,
  "content"           TEXT NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"        TIMESTAMP(3),
  CONSTRAINT "inbox_note_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inbox_note_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inbox_note_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "change_inbox_item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inbox_note_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "workspace_member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "inbox_note_workspace_id_inbox_item_id_deleted_at_idx" ON "inbox_note"("workspace_id", "inbox_item_id", "deleted_at");

-- ═══════════════════════════════════════════════════════════════
-- 12. Notification / Delivery / Preference / Reminder / Outbox
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "notification_preference" (
  "id"                    TEXT NOT NULL,
  "workspace_member_id"   TEXT NOT NULL,
  "change_in_app"         BOOLEAN NOT NULL DEFAULT true,
  "change_email"          BOOLEAN NOT NULL DEFAULT false,
  "reminder_in_app"       BOOLEAN NOT NULL DEFAULT true,
  "reminder_email"        BOOLEAN NOT NULL DEFAULT false,
  "digest_mode"           TEXT NOT NULL DEFAULT 'IMMEDIATE',
  "quiet_hours_start"     TEXT,
  "quiet_hours_end"       TEXT,
  "timezone"              TEXT NOT NULL DEFAULT 'Asia/Seoul',
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preference_workspace_member_id_fkey" FOREIGN KEY ("workspace_member_id") REFERENCES "workspace_member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notification_preference_workspace_member_id_key" ON "notification_preference"("workspace_member_id");

CREATE TABLE "notification" (
  "id"                 TEXT NOT NULL,
  "workspace_id"       TEXT NOT NULL,
  "recipient_user_id"  TEXT NOT NULL,
  "kind"               TEXT NOT NULL,
  "change_event_id"    TEXT,
  "inbox_item_id"      TEXT,
  "task_id"            TEXT,
  "title"              TEXT NOT NULL,
  "body"               TEXT NOT NULL,
  "dedupe_key"         TEXT,
  "read_at"            TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notification_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notification_change_event_id_fkey" FOREIGN KEY ("change_event_id") REFERENCES "legal_change_event"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "notification_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "change_inbox_item"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "notification_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "notification_recipient_user_id_read_at_created_at_idx" ON "notification"("recipient_user_id", "read_at", "created_at" DESC);
CREATE INDEX "notification_workspace_id_created_at_idx" ON "notification"("workspace_id", "created_at" DESC);

CREATE TABLE "notification_delivery" (
  "id"                   TEXT NOT NULL,
  "notification_id"      TEXT NOT NULL,
  "channel"              TEXT NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'PENDING',
  "attempt_count"        INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at"      TIMESTAMP(3),
  "provider"             TEXT,
  "provider_message_id"  TEXT,
  "sent_at"              TIMESTAMP(3),
  "last_error"           TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_delivery_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notification_delivery_notification_id_channel_key" ON "notification_delivery"("notification_id", "channel");
CREATE INDEX "notification_delivery_status_next_attempt_at_idx" ON "notification_delivery"("status", "next_attempt_at");

CREATE TABLE "reminder" (
  "id"                     TEXT NOT NULL,
  "workspace_id"           TEXT NOT NULL,
  "recipient_member_id"    TEXT,
  "inbox_item_id"          TEXT,
  "task_id"                TEXT,
  "remind_at"              TIMESTAMP(3) NOT NULL,
  "channel"                TEXT NOT NULL DEFAULT 'IN_APP',
  "status"                 TEXT NOT NULL DEFAULT 'PENDING',
  "sent_at"                TIMESTAMP(3),
  "attempt_count"          INTEGER NOT NULL DEFAULT 0,
  "last_error"             TEXT,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reminder_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reminder_recipient_member_id_fkey" FOREIGN KEY ("recipient_member_id") REFERENCES "workspace_member"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "reminder_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "change_inbox_item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reminder_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reminder_target_check" CHECK ((task_id IS NULL) <> (inbox_item_id IS NULL))
);
CREATE INDEX "reminder_status_remind_at_idx" ON "reminder"("status", "remind_at");
CREATE INDEX "reminder_workspace_id_status_idx" ON "reminder"("workspace_id", "status");

CREATE TABLE "domain_outbox" (
  "id"              TEXT NOT NULL,
  "event_type"      TEXT NOT NULL,
  "aggregate_type"  TEXT NOT NULL,
  "aggregate_id"    TEXT NOT NULL,
  "dedupe_key"      TEXT NOT NULL,
  "payload"         JSONB NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'PENDING',
  "attempt_count"   INTEGER NOT NULL DEFAULT 0,
  "next_run_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at"       TIMESTAMP(3),
  "locked_by"       TEXT,
  "last_error"      TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at"    TIMESTAMP(3),
  CONSTRAINT "domain_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "domain_outbox_dedupe_key_key" ON "domain_outbox"("dedupe_key");
CREATE INDEX "domain_outbox_status_next_run_at_idx" ON "domain_outbox"("status", "next_run_at");
CREATE INDEX "domain_outbox_event_type_created_at_idx" ON "domain_outbox"("event_type", "created_at" DESC);

-- ═══════════════════════════════════════════════════════════════
-- 14. AdminAuditLog 확장 + WorkspaceAuditLog
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "admin_audit_log"
  ADD COLUMN "actor_user_id" TEXT,
  ADD COLUMN "target_type"   TEXT,
  ADD COLUMN "target_id"     TEXT,
  ADD COLUMN "ip_hash"       TEXT;

ALTER TABLE "admin_audit_log"
  ADD CONSTRAINT "admin_audit_log_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "workspace_audit_log" (
  "id"                TEXT NOT NULL,
  "workspace_id"      TEXT NOT NULL,
  "actor_member_id"   TEXT,
  "action"            TEXT NOT NULL,
  "entity_type"       TEXT NOT NULL,
  "entity_id"         TEXT NOT NULL,
  "before_data"       JSONB,
  "after_data"        JSONB,
  "metadata"          JSONB,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_audit_log_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_audit_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_audit_log_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "workspace_member"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "workspace_audit_log_workspace_id_created_at_idx" ON "workspace_audit_log"("workspace_id", "created_at" DESC);
CREATE INDEX "workspace_audit_log_workspace_id_entity_type_entity_id_idx" ON "workspace_audit_log"("workspace_id", "entity_type", "entity_id");
