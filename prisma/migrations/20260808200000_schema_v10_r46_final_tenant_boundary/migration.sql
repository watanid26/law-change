-- Round 4.6 — Final tenant boundary hardening (schema v10)
-- Round 4.5 에서 다루지 않은 사용자 데이터 테이블에 composite FK 적용.
-- 대상: DocumentNote, InboxNote, Reminder, WorkspaceAuditLog, Notification.
-- + Reminder.target-exactly-one CHECK
-- + Notification.recipientMemberId 도입 (기존 recipientUserId 대체)
--
-- 사전 조건: 대상 5개 테이블 모두 empty (2026-08-08 확인).
-- 데이터가 없으므로 backfill 없이 컬럼 추가/삭제 + FK 재정의 안전.

BEGIN;

-- ═════════════════════════════════════════════════════════════
-- SECTION 1. Drop existing single-FK constraints
-- ═════════════════════════════════════════════════════════════
ALTER TABLE "document_note" DROP CONSTRAINT IF EXISTS "document_note_author_member_id_fkey";
ALTER TABLE "inbox_note"    DROP CONSTRAINT IF EXISTS "inbox_note_inbox_item_id_fkey";
ALTER TABLE "inbox_note"    DROP CONSTRAINT IF EXISTS "inbox_note_author_member_id_fkey";
ALTER TABLE "reminder"      DROP CONSTRAINT IF EXISTS "reminder_recipient_member_id_fkey";
ALTER TABLE "reminder"      DROP CONSTRAINT IF EXISTS "reminder_inbox_item_id_fkey";
ALTER TABLE "reminder"      DROP CONSTRAINT IF EXISTS "reminder_task_id_fkey";
ALTER TABLE "workspace_audit_log" DROP CONSTRAINT IF EXISTS "workspace_audit_log_actor_member_id_fkey";
ALTER TABLE "notification"  DROP CONSTRAINT IF EXISTS "notification_recipient_user_id_fkey";
ALTER TABLE "notification"  DROP CONSTRAINT IF EXISTS "notification_inbox_item_id_fkey";
ALTER TABLE "notification"  DROP CONSTRAINT IF EXISTS "notification_task_id_fkey";
ALTER TABLE "notification"  DROP CONSTRAINT IF EXISTS "notification_change_event_id_fkey";

-- ═════════════════════════════════════════════════════════════
-- SECTION 2. DocumentNote — author composite FK
-- ═════════════════════════════════════════════════════════════
ALTER TABLE "document_note"
  ADD CONSTRAINT "document_note_author_member_id_workspace_id_fkey"
  FOREIGN KEY ("author_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE CASCADE;

-- ═════════════════════════════════════════════════════════════
-- SECTION 3. InboxNote — inbox + author composite FK
-- ═════════════════════════════════════════════════════════════
ALTER TABLE "inbox_note"
  ADD CONSTRAINT "inbox_note_inbox_item_id_workspace_id_fkey"
  FOREIGN KEY ("inbox_item_id", "workspace_id")
  REFERENCES "change_inbox_item" ("id", "workspace_id")
  ON DELETE CASCADE;
ALTER TABLE "inbox_note"
  ADD CONSTRAINT "inbox_note_author_member_id_workspace_id_fkey"
  FOREIGN KEY ("author_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE CASCADE;

-- ═════════════════════════════════════════════════════════════
-- SECTION 4. Reminder — 모든 relation composite FK + exactly-one target CHECK
-- ═════════════════════════════════════════════════════════════
ALTER TABLE "reminder"
  ADD CONSTRAINT "reminder_recipient_member_id_workspace_id_fkey"
  FOREIGN KEY ("recipient_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("recipient_member_id");
ALTER TABLE "reminder"
  ADD CONSTRAINT "reminder_inbox_item_id_workspace_id_fkey"
  FOREIGN KEY ("inbox_item_id", "workspace_id")
  REFERENCES "change_inbox_item" ("id", "workspace_id")
  ON DELETE CASCADE;
ALTER TABLE "reminder"
  ADD CONSTRAINT "reminder_task_id_workspace_id_fkey"
  FOREIGN KEY ("task_id", "workspace_id")
  REFERENCES "task" ("id", "workspace_id")
  ON DELETE CASCADE;

-- target 은 반드시 inbox 또는 task 중 정확히 하나만. XOR.
ALTER TABLE "reminder"
  ADD CONSTRAINT "reminder_target_exactly_one_check"
  CHECK (
    ("inbox_item_id" IS NOT NULL AND "task_id" IS NULL) OR
    ("inbox_item_id" IS NULL     AND "task_id" IS NOT NULL)
  );

-- ═════════════════════════════════════════════════════════════
-- SECTION 5. WorkspaceAuditLog — actor composite FK (system action 은 null 허용)
-- ═════════════════════════════════════════════════════════════
ALTER TABLE "workspace_audit_log"
  ADD CONSTRAINT "workspace_audit_log_actor_member_id_workspace_id_fkey"
  FOREIGN KEY ("actor_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("actor_member_id");

-- ═════════════════════════════════════════════════════════════
-- SECTION 6. Notification — recipientUserId → recipientMemberId 로 교체
--   기존 recipientUserId 는 Workspace 컨텍스트 없이 AppUser 만 참조 →
--   같은 사용자가 여러 Workspace 에 속했을 때 tenant boundary 무너짐.
--   테이블 empty (0 rows) 확인됨.
-- ═════════════════════════════════════════════════════════════
ALTER TABLE "notification" DROP COLUMN IF EXISTS "recipient_user_id";
ALTER TABLE "notification" ADD COLUMN "recipient_member_id" TEXT NOT NULL;

ALTER TABLE "notification"
  ADD CONSTRAINT "notification_recipient_member_id_workspace_id_fkey"
  FOREIGN KEY ("recipient_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE CASCADE;

-- inbox / task 도 tenant-guarded composite FK
ALTER TABLE "notification"
  ADD CONSTRAINT "notification_inbox_item_id_workspace_id_fkey"
  FOREIGN KEY ("inbox_item_id", "workspace_id")
  REFERENCES "change_inbox_item" ("id", "workspace_id")
  ON DELETE SET NULL ("inbox_item_id");
ALTER TABLE "notification"
  ADD CONSTRAINT "notification_task_id_workspace_id_fkey"
  FOREIGN KEY ("task_id", "workspace_id")
  REFERENCES "task" ("id", "workspace_id")
  ON DELETE SET NULL ("task_id");

-- changeEvent 은 legal corpus (global) 이므로 tenant guard 대상 아님. 기본 FK 로 복구.
ALTER TABLE "notification"
  ADD CONSTRAINT "notification_change_event_id_fkey"
  FOREIGN KEY ("change_event_id")
  REFERENCES "legal_change_event" ("id")
  ON DELETE SET NULL;

-- 기존 index 정리 및 재정의
DROP INDEX IF EXISTS "notification_recipient_user_id_read_at_created_at_idx";
CREATE INDEX IF NOT EXISTS "notification_recipient_member_id_read_at_created_at_idx"
  ON "notification" ("recipient_member_id", "read_at", "created_at" DESC);

-- ═════════════════════════════════════════════════════════════
-- SECTION 7. Housekeeping — helpful indexes for FK lookups
-- ═════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS "reminder_recipient_member_id_workspace_id_idx"
  ON "reminder" ("recipient_member_id", "workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_audit_log_actor_member_id_idx"
  ON "workspace_audit_log" ("actor_member_id");
CREATE INDEX IF NOT EXISTS "notification_recipient_member_id_idx"
  ON "notification" ("recipient_member_id");

COMMIT;
