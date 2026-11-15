-- Round 4.5 — Tenant / Data Integrity Hardening (schema v9)
--
-- 목적: 다중 사용자 기능 확정 전에 DB 레벨에서 다음을 강제한다.
-- 1. Workspace A 데이터는 Workspace B 데이터와 FK로 이어질 수 없다.
-- 2. Document A의 Version/ContentUnit/Diff는 Document B의 것과 섞일 수 없다.
-- 3. Migration은 기존 데이터를 조용히 삭제하거나 실패해서는 안 된다.
--
-- 접근: composite FK (child.workspaceId, child.refId) → parent(workspaceId, id).
-- 필요한 곳엔 workspaceId/documentId 컬럼을 denormalize.

BEGIN;

-- ═════════════════════════════════════════════════════════════
-- SECTION 1. Reconciliation duplicate active session cleanup
-- ═════════════════════════════════════════════════════════════
-- v8 에서 partial unique index 를 만들었지만, 이 마이그레이션이 v8 이전
-- 상태로 재실행될 가능성 / 향후 replay 대비 defensive cleanup.
-- source_type 별 RUNNING 세션이 여러 개면 최신 1개만 유지, 나머지는 FAILED.
DO $$
DECLARE
  v_dup_count int;
BEGIN
  WITH ranked AS (
    SELECT id,
           source_type,
           ROW_NUMBER() OVER (
             PARTITION BY source_type
             ORDER BY
               heartbeat_at DESC NULLS LAST,
               updated_at DESC,
               started_at DESC,
               id
           ) AS rn
      FROM reconciliation_progress
     WHERE status = 'RUNNING'
  )
  UPDATE reconciliation_progress rp
     SET status      = 'FAILED',
         finished_at = COALESCE(rp.finished_at, NOW()),
         last_error  = COALESCE(rp.last_error, 'DUPLICATE_ACTIVE_SESSION_MIGRATION_CLEANUP'),
         locked_at   = NULL,
         locked_by   = NULL
    FROM ranked r
   WHERE rp.id = r.id
     AND r.rn > 1;

  GET DIAGNOSTICS v_dup_count = ROW_COUNT;
  IF v_dup_count > 0 THEN
    RAISE NOTICE 'v9_r45: cleaned up % duplicate RUNNING reconciliation sessions', v_dup_count;
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════
-- SECTION 2. Legacy user-facing table guards
-- ═════════════════════════════════════════════════════════════
-- 과거 라운드에서 이미 DROP 된 legacy MVP 테이블들 (user_watch, review_record 등).
-- 이 마이그레이션이 legacy 상태의 DB 에서 replay 되어도 조용히 데이터를 잃지
-- 않도록, 존재하면 비어 있어야 통과. 데이터가 있으면 명시적 에러.
DO $$
DECLARE
  v_table text;
  v_rows  int;
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY[
      'user_watch',
      'user_profile',
      'review_record',
      'checklist',
      'memo',
      'reminder_legacy',
      'notification_legacy'
    ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      EXECUTE format('SELECT COUNT(*) FROM %I', v_table) INTO v_rows;
      IF v_rows > 0 THEN
        RAISE EXCEPTION 'v9_r45: legacy table % has % rows — refusing to drop silently', v_table, v_rows;
      END IF;
      EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', v_table);
      RAISE NOTICE 'v9_r45: dropped empty legacy table %', v_table;
    END IF;
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════
-- SECTION 3. Parent composite uniques (id, tenant_key)
--   composite FK 를 만들려면 참조 대상에 대응 unique 가 필요.
-- ═════════════════════════════════════════════════════════════

-- Workspace-scoped 테이블
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_member_id_workspace_unique"
  ON "workspace_member" ("id", "workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "department_id_workspace_unique"
  ON "department" ("id", "workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "folder_id_workspace_unique"
  ON "folder" ("id", "workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "change_inbox_item_id_workspace_unique"
  ON "change_inbox_item" ("id", "workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "task_id_workspace_unique"
  ON "task" ("id", "workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "internal_policy_id_workspace_unique"
  ON "internal_policy" ("id", "workspace_id");
-- Watch: workspaceId 로도, (workspaceId + documentId) 로도 참조
CREATE UNIQUE INDEX IF NOT EXISTS "watch_id_workspace_unique"
  ON "watch" ("id", "workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "watch_id_workspace_document_unique"
  ON "watch" ("id", "workspace_id", "document_id");

-- Document-scoped 테이블
CREATE UNIQUE INDEX IF NOT EXISTS "legal_document_version_id_document_unique"
  ON "legal_document_version" ("id", "document_id");
CREATE UNIQUE INDEX IF NOT EXISTS "legal_content_unit_id_document_unique"
  ON "legal_content_unit" ("id", "document_id");
CREATE UNIQUE INDEX IF NOT EXISTS "legal_content_unit_version_id_document_unique"
  ON "legal_content_unit_version" ("id", "content_unit_id"); -- 아래 documentId 컬럼 추가 후 재정의
CREATE UNIQUE INDEX IF NOT EXISTS "legal_change_event_id_document_unique"
  ON "legal_change_event" ("id", "document_id");

-- ═════════════════════════════════════════════════════════════
-- SECTION 4. Denormalize tenant_key / doc_key columns
--   composite FK 를 걸기 위해 자식 테이블에도 workspace_id/document_id 를 물린다.
--   현재 데이터 = 0 (빈 테이블) 이거나 backfill 가능 = 안전.
-- ═════════════════════════════════════════════════════════════

-- department_member: department 로부터 workspace_id 복제
ALTER TABLE "department_member" ADD COLUMN IF NOT EXISTS "workspace_id" TEXT;
UPDATE "department_member" dm
   SET "workspace_id" = d."workspace_id"
  FROM "department" d
 WHERE d."id" = dm."department_id"
   AND dm."workspace_id" IS NULL;
ALTER TABLE "department_member" ALTER COLUMN "workspace_id" SET NOT NULL;

-- inbox_affected_department: inbox 로부터 workspace_id 복제
ALTER TABLE "inbox_affected_department" ADD COLUMN IF NOT EXISTS "workspace_id" TEXT;
UPDATE "inbox_affected_department" iad
   SET "workspace_id" = i."workspace_id"
  FROM "change_inbox_item" i
 WHERE i."id" = iad."inbox_item_id"
   AND iad."workspace_id" IS NULL;
ALTER TABLE "inbox_affected_department" ALTER COLUMN "workspace_id" SET NOT NULL;

-- task_approval: task 로부터 workspace_id 복제
ALTER TABLE "task_approval" ADD COLUMN IF NOT EXISTS "workspace_id" TEXT;
UPDATE "task_approval" ta
   SET "workspace_id" = t."workspace_id"
  FROM "task" t
 WHERE t."id" = ta."task_id"
   AND ta."workspace_id" IS NULL;
ALTER TABLE "task_approval" ALTER COLUMN "workspace_id" SET NOT NULL;

-- watch_content_scope: watch 로부터 workspace_id + document_id 복제
ALTER TABLE "watch_content_scope" ADD COLUMN IF NOT EXISTS "workspace_id" TEXT;
ALTER TABLE "watch_content_scope" ADD COLUMN IF NOT EXISTS "document_id" TEXT;
UPDATE "watch_content_scope" wcs
   SET "workspace_id" = w."workspace_id",
       "document_id"  = w."document_id"
  FROM "watch" w
 WHERE w."id" = wcs."watch_id"
   AND (wcs."workspace_id" IS NULL OR wcs."document_id" IS NULL);
ALTER TABLE "watch_content_scope" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "watch_content_scope" ALTER COLUMN "document_id"  SET NOT NULL;

-- internal_policy_version: policy 로부터 workspace_id 복제
ALTER TABLE "internal_policy_version" ADD COLUMN IF NOT EXISTS "workspace_id" TEXT;
UPDATE "internal_policy_version" ipv
   SET "workspace_id" = p."workspace_id"
  FROM "internal_policy" p
 WHERE p."id" = ipv."policy_id"
   AND ipv."workspace_id" IS NULL;
ALTER TABLE "internal_policy_version" ALTER COLUMN "workspace_id" SET NOT NULL;

-- legal_content_unit_version: contentUnit 로부터 document_id 복제 (98k rows)
ALTER TABLE "legal_content_unit_version" ADD COLUMN IF NOT EXISTS "document_id" TEXT;
UPDATE "legal_content_unit_version" cuv
   SET "document_id" = cu."document_id"
  FROM "legal_content_unit" cu
 WHERE cu."id" = cuv."content_unit_id"
   AND cuv."document_id" IS NULL;
ALTER TABLE "legal_content_unit_version" ALTER COLUMN "document_id" SET NOT NULL;

-- legal_diff: changeEvent 로부터 document_id 복제 (7k rows)
ALTER TABLE "legal_diff" ADD COLUMN IF NOT EXISTS "document_id" TEXT;
UPDATE "legal_diff" d
   SET "document_id" = e."document_id"
  FROM "legal_change_event" e
 WHERE e."id" = d."change_event_id"
   AND d."document_id" IS NULL;
ALTER TABLE "legal_diff" ALTER COLUMN "document_id" SET NOT NULL;

-- ═════════════════════════════════════════════════════════════
-- SECTION 5. Denormalized 컬럼 기반 composite uniques (parent)
--   Section 3 에서 만들 수 없었던 것들.
-- ═════════════════════════════════════════════════════════════

-- 위에서 임시로 만든 (id, content_unit_id) unique 는 실제로는 (id, document_id) 여야 함
DROP INDEX IF EXISTS "legal_content_unit_version_id_document_unique";
CREATE UNIQUE INDEX "legal_content_unit_version_id_document_unique"
  ON "legal_content_unit_version" ("id", "document_id");

-- ═════════════════════════════════════════════════════════════
-- SECTION 6. Drop existing single-FK constraints (replaced by composite)
-- ═════════════════════════════════════════════════════════════

-- 이름 규칙: Prisma 생성 이름 (table_column_fkey). IF EXISTS 로 방어.

-- DepartmentMember
ALTER TABLE "department_member" DROP CONSTRAINT IF EXISTS "department_member_department_id_fkey";
ALTER TABLE "department_member" DROP CONSTRAINT IF EXISTS "department_member_workspace_member_id_fkey";

-- InboxAffectedDepartment
ALTER TABLE "inbox_affected_department" DROP CONSTRAINT IF EXISTS "inbox_affected_department_inbox_item_id_fkey";
ALTER TABLE "inbox_affected_department" DROP CONSTRAINT IF EXISTS "inbox_affected_department_department_id_fkey";

-- TaskApproval
ALTER TABLE "task_approval" DROP CONSTRAINT IF EXISTS "task_approval_task_id_fkey";
ALTER TABLE "task_approval" DROP CONSTRAINT IF EXISTS "task_approval_reviewer_member_id_fkey";
ALTER TABLE "task_approval" DROP CONSTRAINT IF EXISTS "task_approval_approver_member_id_fkey";

-- WatchContentScope
ALTER TABLE "watch_content_scope" DROP CONSTRAINT IF EXISTS "watch_content_scope_watch_id_fkey";

-- InternalPolicyVersion
ALTER TABLE "internal_policy_version" DROP CONSTRAINT IF EXISTS "internal_policy_version_policy_id_fkey";

-- LegalPolicyMapping
ALTER TABLE "legal_policy_mapping" DROP CONSTRAINT IF EXISTS "legal_policy_mapping_policy_id_fkey";
ALTER TABLE "legal_policy_mapping" DROP CONSTRAINT IF EXISTS "legal_policy_mapping_created_by_member_id_fkey";
ALTER TABLE "legal_policy_mapping" DROP CONSTRAINT IF EXISTS "legal_policy_mapping_content_unit_id_fkey";

-- InternalPolicy
ALTER TABLE "internal_policy" DROP CONSTRAINT IF EXISTS "internal_policy_owner_department_id_fkey";

-- Watch
ALTER TABLE "watch" DROP CONSTRAINT IF EXISTS "watch_created_by_member_id_fkey";
ALTER TABLE "watch" DROP CONSTRAINT IF EXISTS "watch_owner_department_id_fkey";
ALTER TABLE "watch" DROP CONSTRAINT IF EXISTS "watch_owner_member_id_fkey";
ALTER TABLE "watch" DROP CONSTRAINT IF EXISTS "watch_folder_id_fkey";

-- ChangeInboxItem
ALTER TABLE "change_inbox_item" DROP CONSTRAINT IF EXISTS "change_inbox_item_assigned_to_member_id_fkey";
ALTER TABLE "change_inbox_item" DROP CONSTRAINT IF EXISTS "change_inbox_item_owner_department_id_fkey";
ALTER TABLE "change_inbox_item" DROP CONSTRAINT IF EXISTS "change_inbox_item_watch_id_fkey";

-- Task
ALTER TABLE "task" DROP CONSTRAINT IF EXISTS "task_inbox_item_id_fkey";
ALTER TABLE "task" DROP CONSTRAINT IF EXISTS "task_owner_department_id_fkey";
ALTER TABLE "task" DROP CONSTRAINT IF EXISTS "task_assignee_member_id_fkey";
ALTER TABLE "task" DROP CONSTRAINT IF EXISTS "task_created_by_member_id_fkey";

-- Evidence
ALTER TABLE "evidence" DROP CONSTRAINT IF EXISTS "evidence_task_id_fkey";
ALTER TABLE "evidence" DROP CONSTRAINT IF EXISTS "evidence_uploaded_by_member_id_fkey";

-- Folder
ALTER TABLE "folder" DROP CONSTRAINT IF EXISTS "folder_parent_id_fkey";

-- Department (self-ref parent)
ALTER TABLE "department" DROP CONSTRAINT IF EXISTS "department_parent_id_fkey";

-- Legal corpus
ALTER TABLE "legal_change_event" DROP CONSTRAINT IF EXISTS "legal_change_event_previous_version_id_fkey";
ALTER TABLE "legal_change_event" DROP CONSTRAINT IF EXISTS "legal_change_event_new_version_id_fkey";
ALTER TABLE "legal_content_unit_version" DROP CONSTRAINT IF EXISTS "legal_content_unit_version_content_unit_id_fkey";
ALTER TABLE "legal_content_unit_version" DROP CONSTRAINT IF EXISTS "legal_content_unit_version_document_version_id_fkey";
ALTER TABLE "legal_diff" DROP CONSTRAINT IF EXISTS "legal_diff_change_event_id_fkey";
ALTER TABLE "legal_diff" DROP CONSTRAINT IF EXISTS "legal_diff_content_unit_id_fkey";
ALTER TABLE "legal_diff" DROP CONSTRAINT IF EXISTS "legal_diff_old_content_unit_version_id_fkey";
ALTER TABLE "legal_diff" DROP CONSTRAINT IF EXISTS "legal_diff_new_content_unit_version_id_fkey";

-- ═════════════════════════════════════════════════════════════
-- SECTION 7. Composite FKs (workspace-scoped)
-- ═════════════════════════════════════════════════════════════

-- DepartmentMember
ALTER TABLE "department_member"
  ADD CONSTRAINT "department_member_department_id_workspace_id_fkey"
  FOREIGN KEY ("department_id", "workspace_id")
  REFERENCES "department" ("id", "workspace_id")
  ON DELETE CASCADE;
ALTER TABLE "department_member"
  ADD CONSTRAINT "department_member_workspace_member_id_workspace_id_fkey"
  FOREIGN KEY ("workspace_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE CASCADE;

-- InboxAffectedDepartment
ALTER TABLE "inbox_affected_department"
  ADD CONSTRAINT "inbox_affected_department_inbox_item_id_workspace_id_fkey"
  FOREIGN KEY ("inbox_item_id", "workspace_id")
  REFERENCES "change_inbox_item" ("id", "workspace_id")
  ON DELETE CASCADE;
ALTER TABLE "inbox_affected_department"
  ADD CONSTRAINT "inbox_affected_department_department_id_workspace_id_fkey"
  FOREIGN KEY ("department_id", "workspace_id")
  REFERENCES "department" ("id", "workspace_id")
  ON DELETE CASCADE;

-- TaskApproval
ALTER TABLE "task_approval"
  ADD CONSTRAINT "task_approval_task_id_workspace_id_fkey"
  FOREIGN KEY ("task_id", "workspace_id")
  REFERENCES "task" ("id", "workspace_id")
  ON DELETE CASCADE;
-- PG 15+ 컬럼-스코프 SET NULL: workspace_id 는 유지, 참조 컬럼만 NULL
ALTER TABLE "task_approval"
  ADD CONSTRAINT "task_approval_reviewer_member_id_workspace_id_fkey"
  FOREIGN KEY ("reviewer_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("reviewer_member_id");
ALTER TABLE "task_approval"
  ADD CONSTRAINT "task_approval_approver_member_id_workspace_id_fkey"
  FOREIGN KEY ("approver_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("approver_member_id");
-- MVP: task 당 approval 1개
CREATE UNIQUE INDEX IF NOT EXISTS "task_approval_task_id_unique"
  ON "task_approval" ("task_id");

-- WatchContentScope
--   watch 와의 관계는 (id, workspace_id, document_id) 3개 컬럼 매칭
ALTER TABLE "watch_content_scope"
  ADD CONSTRAINT "watch_content_scope_watch_id_workspace_id_document_id_fkey"
  FOREIGN KEY ("watch_id", "workspace_id", "document_id")
  REFERENCES "watch" ("id", "workspace_id", "document_id")
  ON DELETE CASCADE;
--   ContentUnit 은 (id, document_id) 로 매칭 → 다른 문서의 조문 연결 방지
ALTER TABLE "watch_content_scope"
  ADD CONSTRAINT "watch_content_scope_content_unit_id_document_id_fkey"
  FOREIGN KEY ("content_unit_id", "document_id")
  REFERENCES "legal_content_unit" ("id", "document_id")
  ON DELETE CASCADE;

-- InternalPolicyVersion
ALTER TABLE "internal_policy_version"
  ADD CONSTRAINT "internal_policy_version_policy_id_workspace_id_fkey"
  FOREIGN KEY ("policy_id", "workspace_id")
  REFERENCES "internal_policy" ("id", "workspace_id")
  ON DELETE CASCADE;
--   createdByMemberId: 지금까지 raw String 이었던 것 → 실제 FK + tenant consistency
ALTER TABLE "internal_policy_version"
  ADD CONSTRAINT "internal_policy_version_created_by_member_id_workspace_id_fkey"
  FOREIGN KEY ("created_by_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("created_by_member_id");

-- InternalPolicy
ALTER TABLE "internal_policy"
  ADD CONSTRAINT "internal_policy_owner_department_id_workspace_id_fkey"
  FOREIGN KEY ("owner_department_id", "workspace_id")
  REFERENCES "department" ("id", "workspace_id")
  ON DELETE SET NULL ("owner_department_id");

-- LegalPolicyMapping
ALTER TABLE "legal_policy_mapping"
  ADD CONSTRAINT "legal_policy_mapping_policy_id_workspace_id_fkey"
  FOREIGN KEY ("policy_id", "workspace_id")
  REFERENCES "internal_policy" ("id", "workspace_id")
  ON DELETE CASCADE;
ALTER TABLE "legal_policy_mapping"
  ADD CONSTRAINT "legal_policy_mapping_created_by_member_id_workspace_id_fkey"
  FOREIGN KEY ("created_by_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE CASCADE;
--   contentUnit 은 (id, document_id) 로 → 다른 documentId 의 조문 연결 방지
ALTER TABLE "legal_policy_mapping"
  ADD CONSTRAINT "legal_policy_mapping_content_unit_id_document_id_fkey"
  FOREIGN KEY ("content_unit_id", "document_id")
  REFERENCES "legal_content_unit" ("id", "document_id")
  ON DELETE SET NULL ("content_unit_id");

-- Watch
ALTER TABLE "watch"
  ADD CONSTRAINT "watch_created_by_member_id_workspace_id_fkey"
  FOREIGN KEY ("created_by_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE CASCADE;
ALTER TABLE "watch"
  ADD CONSTRAINT "watch_owner_department_id_workspace_id_fkey"
  FOREIGN KEY ("owner_department_id", "workspace_id")
  REFERENCES "department" ("id", "workspace_id")
  ON DELETE SET NULL ("owner_department_id");
ALTER TABLE "watch"
  ADD CONSTRAINT "watch_owner_member_id_workspace_id_fkey"
  FOREIGN KEY ("owner_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("owner_member_id");
ALTER TABLE "watch"
  ADD CONSTRAINT "watch_folder_id_workspace_id_fkey"
  FOREIGN KEY ("folder_id", "workspace_id")
  REFERENCES "folder" ("id", "workspace_id")
  ON DELETE SET NULL ("folder_id");

-- ChangeInboxItem
ALTER TABLE "change_inbox_item"
  ADD CONSTRAINT "change_inbox_item_assigned_to_member_id_workspace_id_fkey"
  FOREIGN KEY ("assigned_to_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("assigned_to_member_id");
ALTER TABLE "change_inbox_item"
  ADD CONSTRAINT "change_inbox_item_owner_department_id_workspace_id_fkey"
  FOREIGN KEY ("owner_department_id", "workspace_id")
  REFERENCES "department" ("id", "workspace_id")
  ON DELETE SET NULL ("owner_department_id");
ALTER TABLE "change_inbox_item"
  ADD CONSTRAINT "change_inbox_item_watch_id_workspace_id_fkey"
  FOREIGN KEY ("watch_id", "workspace_id")
  REFERENCES "watch" ("id", "workspace_id")
  ON DELETE SET NULL ("watch_id");

-- Task
ALTER TABLE "task"
  ADD CONSTRAINT "task_inbox_item_id_workspace_id_fkey"
  FOREIGN KEY ("inbox_item_id", "workspace_id")
  REFERENCES "change_inbox_item" ("id", "workspace_id")
  ON DELETE SET NULL ("inbox_item_id");
ALTER TABLE "task"
  ADD CONSTRAINT "task_owner_department_id_workspace_id_fkey"
  FOREIGN KEY ("owner_department_id", "workspace_id")
  REFERENCES "department" ("id", "workspace_id")
  ON DELETE SET NULL ("owner_department_id");
ALTER TABLE "task"
  ADD CONSTRAINT "task_assignee_member_id_workspace_id_fkey"
  FOREIGN KEY ("assignee_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("assignee_member_id");
ALTER TABLE "task"
  ADD CONSTRAINT "task_created_by_member_id_workspace_id_fkey"
  FOREIGN KEY ("created_by_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE CASCADE;

-- Evidence
ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_task_id_workspace_id_fkey"
  FOREIGN KEY ("task_id", "workspace_id")
  REFERENCES "task" ("id", "workspace_id")
  ON DELETE CASCADE;
ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_uploaded_by_member_id_workspace_id_fkey"
  FOREIGN KEY ("uploaded_by_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE CASCADE;

-- Folder (self-ref parent, same workspace)
ALTER TABLE "folder"
  ADD CONSTRAINT "folder_parent_id_workspace_id_fkey"
  FOREIGN KEY ("parent_id", "workspace_id")
  REFERENCES "folder" ("id", "workspace_id")
  ON DELETE SET NULL ("parent_id");

-- Department (self-ref parent, same workspace)
ALTER TABLE "department"
  ADD CONSTRAINT "department_parent_id_workspace_id_fkey"
  FOREIGN KEY ("parent_id", "workspace_id")
  REFERENCES "department" ("id", "workspace_id")
  ON DELETE SET NULL ("parent_id");

-- ═════════════════════════════════════════════════════════════
-- SECTION 8. Composite FKs (document-scoped)
-- ═════════════════════════════════════════════════════════════

-- LegalChangeEvent: previous/new version 은 같은 document 여야
ALTER TABLE "legal_change_event"
  ADD CONSTRAINT "legal_change_event_previous_version_id_document_id_fkey"
  FOREIGN KEY ("previous_version_id", "document_id")
  REFERENCES "legal_document_version" ("id", "document_id")
  ON DELETE NO ACTION;
ALTER TABLE "legal_change_event"
  ADD CONSTRAINT "legal_change_event_new_version_id_document_id_fkey"
  FOREIGN KEY ("new_version_id", "document_id")
  REFERENCES "legal_document_version" ("id", "document_id")
  ON DELETE NO ACTION;

-- LegalContentUnitVersion: contentUnit + documentVersion 이 같은 document
ALTER TABLE "legal_content_unit_version"
  ADD CONSTRAINT "legal_content_unit_version_content_unit_id_document_id_fkey"
  FOREIGN KEY ("content_unit_id", "document_id")
  REFERENCES "legal_content_unit" ("id", "document_id")
  ON DELETE CASCADE;
ALTER TABLE "legal_content_unit_version"
  ADD CONSTRAINT "legal_content_unit_version_document_version_id_document_id_fkey"
  FOREIGN KEY ("document_version_id", "document_id")
  REFERENCES "legal_document_version" ("id", "document_id")
  ON DELETE CASCADE;

-- LegalDiff: changeEvent + contentUnit + oldVersion + newVersion 모두 같은 document
ALTER TABLE "legal_diff"
  ADD CONSTRAINT "legal_diff_change_event_id_document_id_fkey"
  FOREIGN KEY ("change_event_id", "document_id")
  REFERENCES "legal_change_event" ("id", "document_id")
  ON DELETE CASCADE;
ALTER TABLE "legal_diff"
  ADD CONSTRAINT "legal_diff_content_unit_id_document_id_fkey"
  FOREIGN KEY ("content_unit_id", "document_id")
  REFERENCES "legal_content_unit" ("id", "document_id")
  ON DELETE SET NULL ("content_unit_id");
ALTER TABLE "legal_diff"
  ADD CONSTRAINT "legal_diff_old_content_unit_version_id_document_id_fkey"
  FOREIGN KEY ("old_content_unit_version_id", "document_id")
  REFERENCES "legal_content_unit_version" ("id", "document_id")
  ON DELETE SET NULL ("old_content_unit_version_id");
ALTER TABLE "legal_diff"
  ADD CONSTRAINT "legal_diff_new_content_unit_version_id_document_id_fkey"
  FOREIGN KEY ("new_content_unit_version_id", "document_id")
  REFERENCES "legal_content_unit_version" ("id", "document_id")
  ON DELETE SET NULL ("new_content_unit_version_id");

-- ═════════════════════════════════════════════════════════════
-- SECTION 9. Housekeeping indices for FK performance
-- ═════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS "department_member_workspace_id_idx"
  ON "department_member" ("workspace_id");
CREATE INDEX IF NOT EXISTS "inbox_affected_department_workspace_id_idx"
  ON "inbox_affected_department" ("workspace_id");
CREATE INDEX IF NOT EXISTS "task_approval_workspace_id_idx"
  ON "task_approval" ("workspace_id");
CREATE INDEX IF NOT EXISTS "watch_content_scope_workspace_id_idx"
  ON "watch_content_scope" ("workspace_id");
CREATE INDEX IF NOT EXISTS "internal_policy_version_workspace_id_idx"
  ON "internal_policy_version" ("workspace_id");
CREATE INDEX IF NOT EXISTS "legal_content_unit_version_document_id_idx"
  ON "legal_content_unit_version" ("document_id");
CREATE INDEX IF NOT EXISTS "legal_diff_document_id_idx"
  ON "legal_diff" ("document_id");

COMMIT;
