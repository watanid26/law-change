-- Round 4.7 — Historical Data Retention Hardening (schema v12)
--
-- 핵심 원칙:
--   "사람이 떠나도 조직의 판단·조치·증빙·감사 기록은 남는다."
--
-- 변경:
--   1. creator/author/uploader FK 를 CASCADE 에서 SET NULL 로 (컬럼도 nullable).
--      → WorkspaceMember 삭제 시 Watch/Task/Evidence/Note/Mapping 은 살아남고
--        actor 컬럼만 NULL.
--   2. WorkspaceInvitation: invitedByUserId (AppUser) → invitedByMemberId
--      (WorkspaceMember composite FK) 로 identity 재설계.
--   3. AppUser 삭제 시 WorkspaceMember cascade 를 NO ACTION 으로 변경.
--      → AppUser hard delete 는 어떤 workspace membership 도 없을 때만 가능.
--        기본 정책은 soft delete (status=DELETED, deletedAt).
--
-- 사전 조건: 대상 테이블 모두 empty (2026-08-08 확인). 데이터 백필 불필요.

BEGIN;

-- ═════════════════════════════════════════════════════════════
-- SECTION 1. Task / Evidence / DocumentNote / InboxNote / Watch /
--            LegalPolicyMapping — creator/author/uploader FK 를
--            CASCADE 에서 컬럼-스코프 SET NULL 로 전환 + 컬럼 nullable.
-- ═════════════════════════════════════════════════════════════

-- Task.createdByMemberId
ALTER TABLE "task" DROP CONSTRAINT IF EXISTS "task_created_by_member_id_workspace_id_fkey";
ALTER TABLE "task" ALTER COLUMN "created_by_member_id" DROP NOT NULL;
ALTER TABLE "task"
  ADD CONSTRAINT "task_created_by_member_id_workspace_id_fkey"
  FOREIGN KEY ("created_by_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("created_by_member_id");

-- Evidence.uploadedByMemberId
ALTER TABLE "evidence" DROP CONSTRAINT IF EXISTS "evidence_uploaded_by_member_id_workspace_id_fkey";
ALTER TABLE "evidence" ALTER COLUMN "uploaded_by_member_id" DROP NOT NULL;
ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_uploaded_by_member_id_workspace_id_fkey"
  FOREIGN KEY ("uploaded_by_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("uploaded_by_member_id");

-- DocumentNote.authorMemberId
ALTER TABLE "document_note" DROP CONSTRAINT IF EXISTS "document_note_author_member_id_workspace_id_fkey";
ALTER TABLE "document_note" ALTER COLUMN "author_member_id" DROP NOT NULL;
ALTER TABLE "document_note"
  ADD CONSTRAINT "document_note_author_member_id_workspace_id_fkey"
  FOREIGN KEY ("author_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("author_member_id");

-- InboxNote.authorMemberId
ALTER TABLE "inbox_note" DROP CONSTRAINT IF EXISTS "inbox_note_author_member_id_workspace_id_fkey";
ALTER TABLE "inbox_note" ALTER COLUMN "author_member_id" DROP NOT NULL;
ALTER TABLE "inbox_note"
  ADD CONSTRAINT "inbox_note_author_member_id_workspace_id_fkey"
  FOREIGN KEY ("author_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("author_member_id");

-- Watch.createdByMemberId
ALTER TABLE "watch" DROP CONSTRAINT IF EXISTS "watch_created_by_member_id_workspace_id_fkey";
ALTER TABLE "watch" ALTER COLUMN "created_by_member_id" DROP NOT NULL;
ALTER TABLE "watch"
  ADD CONSTRAINT "watch_created_by_member_id_workspace_id_fkey"
  FOREIGN KEY ("created_by_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("created_by_member_id");

-- LegalPolicyMapping.createdByMemberId
ALTER TABLE "legal_policy_mapping" DROP CONSTRAINT IF EXISTS "legal_policy_mapping_created_by_member_id_workspace_id_fkey";
ALTER TABLE "legal_policy_mapping" ALTER COLUMN "created_by_member_id" DROP NOT NULL;
ALTER TABLE "legal_policy_mapping"
  ADD CONSTRAINT "legal_policy_mapping_created_by_member_id_workspace_id_fkey"
  FOREIGN KEY ("created_by_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("created_by_member_id");

-- ═════════════════════════════════════════════════════════════
-- SECTION 2. WorkspaceInvitation identity 재설계
--   기존: invited_by_user_id → AppUser (tenant boundary 없음)
--   신규: invited_by_member_id → WorkspaceMember (composite FK, tenant-safe)
--
--   테이블 empty 확인 → 백필 불필요, drop + add 안전.
-- ═════════════════════════════════════════════════════════════
ALTER TABLE "workspace_invitation" DROP CONSTRAINT IF EXISTS "workspace_invitation_invited_by_user_id_fkey";
ALTER TABLE "workspace_invitation" DROP COLUMN IF EXISTS "invited_by_user_id";
ALTER TABLE "workspace_invitation" ADD COLUMN "invited_by_member_id" TEXT;

-- composite FK: same workspace 만 초대 가능. 초대자 member 가 나중에 삭제되어도
-- pending invitation history 는 유지 (SET NULL).
ALTER TABLE "workspace_invitation"
  ADD CONSTRAINT "workspace_invitation_invited_by_member_id_workspace_id_fkey"
  FOREIGN KEY ("invited_by_member_id", "workspace_id")
  REFERENCES "workspace_member" ("id", "workspace_id")
  ON DELETE SET NULL ("invited_by_member_id");

CREATE INDEX IF NOT EXISTS "workspace_invitation_invited_by_member_id_idx"
  ON "workspace_invitation" ("invited_by_member_id");

-- ═════════════════════════════════════════════════════════════
-- SECTION 3. AppUser hard-delete 방어 정책
--   현재: WorkspaceMember.userId → AppUser CASCADE
--     → AppUser 삭제 시 모든 membership + 그 하위 데이터 cascade
--   변경: NO ACTION
--     → AppUser hard-delete 는 어떤 workspace 에도 소속되지 않을 때만 가능
--     → 기본 정책은 AppUser.status = 'DELETED' + deletedAt 로 soft delete
--   AuthIdentity 는 그대로 CASCADE 유지 (auth 계정과 identity 는 함께 소멸).
-- ═════════════════════════════════════════════════════════════
ALTER TABLE "workspace_member" DROP CONSTRAINT IF EXISTS "workspace_member_user_id_fkey";
ALTER TABLE "workspace_member"
  ADD CONSTRAINT "workspace_member_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "app_user" ("id")
  ON DELETE NO ACTION;

-- WorkspaceMember 자체는 workspace 삭제 시 여전히 cascade (workspace-scoped).
-- 개인 프로필 관점에선 member.status 로 lifecycle 관리.

COMMIT;
