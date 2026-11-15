-- Schema v8 (Round 4.3 잔여 + Round 4.4 확장)
-- - Reconciliation active session partial unique (race 원천 차단)
-- - Watch 확장: applicabilityStatus, importance, ownerDepartment, reviewFrequency
-- - ChangeInboxItem 확장: applicabilityReason, impactLevel, assessmentText, ownerDepartment + InboxAffectedDepartment
-- - Task.ownerDepartment
-- - Evidence, TaskApproval, Department + DepartmentMember 신설
-- - LegalDocumentRelation, RegulatoryTopic + DocumentTopic 신설
-- - InternalPolicy + InternalPolicyVersion + LegalPolicyMapping 신설

-- ═══════════════════════════════════════════════════════════════
-- 1. Reconciliation partial unique — sourceType별 RUNNING 세션 최대 1개
-- ═══════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "reconciliation_active_source_unique"
  ON "reconciliation_progress"("source_type")
  WHERE status = 'RUNNING';

-- ═══════════════════════════════════════════════════════════════
-- 2. Watch 확장
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "watch"
  ADD COLUMN "applicability_status"    TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "applicability_reason"    TEXT,
  ADD COLUMN "importance"              TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "owner_department_id"     TEXT,
  ADD COLUMN "owner_member_id"         TEXT,
  ADD COLUMN "review_frequency_months" INTEGER,
  ADD COLUMN "last_reviewed_at"        TIMESTAMP(3),
  ADD COLUMN "next_review_at"          TIMESTAMP(3);

CREATE INDEX "watch_workspace_id_applicability_status_idx"
  ON "watch"("workspace_id", "applicability_status");
CREATE INDEX "watch_owner_department_id_status_idx"
  ON "watch"("owner_department_id", "status");
CREATE INDEX "watch_next_review_at_idx"
  ON "watch"("next_review_at");

-- ═══════════════════════════════════════════════════════════════
-- 3. Department + DepartmentMember
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "department" (
  "id"           TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "code"         TEXT,
  "parent_id"    TEXT,
  "status"       TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at"  TIMESTAMP(3),
  CONSTRAINT "department_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "department_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "department_workspace_id_name_key" ON "department"("workspace_id", "name");
CREATE INDEX "department_workspace_id_status_idx" ON "department"("workspace_id", "status");

CREATE TABLE "department_member" (
  "id"                    TEXT NOT NULL,
  "department_id"         TEXT NOT NULL,
  "workspace_member_id"   TEXT NOT NULL,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_member_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_member_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "department_member_workspace_member_id_fkey" FOREIGN KEY ("workspace_member_id") REFERENCES "workspace_member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "department_member_department_id_workspace_member_id_key"
  ON "department_member"("department_id", "workspace_member_id");

-- Watch FK (Watch에서 미리 컬럼만 추가 후 여기서 FK)
ALTER TABLE "watch"
  ADD CONSTRAINT "watch_owner_department_id_fkey"
  FOREIGN KEY ("owner_department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "watch_owner_member_id_fkey"
  FOREIGN KEY ("owner_member_id") REFERENCES "workspace_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- 4. ChangeInboxItem 확장 + InboxAffectedDepartment
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "change_inbox_item"
  ADD COLUMN "applicability_reason" TEXT,
  ADD COLUMN "impact_level"         TEXT,
  ADD COLUMN "assessment_text"      TEXT,
  ADD COLUMN "owner_department_id"  TEXT;

ALTER TABLE "change_inbox_item"
  ADD CONSTRAINT "change_inbox_item_owner_department_id_fkey"
  FOREIGN KEY ("owner_department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "change_inbox_item_owner_department_id_status_idx"
  ON "change_inbox_item"("owner_department_id", "status");

CREATE TABLE "inbox_affected_department" (
  "id"            TEXT NOT NULL,
  "inbox_item_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inbox_affected_department_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inbox_affected_department_inbox_item_id_fkey" FOREIGN KEY ("inbox_item_id") REFERENCES "change_inbox_item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inbox_affected_department_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inbox_affected_department_inbox_item_id_department_id_key"
  ON "inbox_affected_department"("inbox_item_id", "department_id");

-- ═══════════════════════════════════════════════════════════════
-- 5. Task.ownerDepartment
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "task" ADD COLUMN "owner_department_id" TEXT;
ALTER TABLE "task"
  ADD CONSTRAINT "task_owner_department_id_fkey"
  FOREIGN KEY ("owner_department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "task_owner_department_id_status_idx" ON "task"("owner_department_id", "status");

-- ═══════════════════════════════════════════════════════════════
-- 6. Evidence
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "evidence" (
  "id"                     TEXT NOT NULL,
  "workspace_id"           TEXT NOT NULL,
  "task_id"                TEXT NOT NULL,
  "type"                   TEXT NOT NULL,
  "file_reference"         TEXT,
  "external_url"           TEXT,
  "description"            TEXT,
  "uploaded_by_member_id"  TEXT NOT NULL,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"             TIMESTAMP(3),
  CONSTRAINT "evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "evidence_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "evidence_uploaded_by_member_id_fkey" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "workspace_member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "evidence_task_id_deleted_at_idx" ON "evidence"("task_id", "deleted_at");
CREATE INDEX "evidence_workspace_id_created_at_idx" ON "evidence"("workspace_id", "created_at" DESC);

-- ═══════════════════════════════════════════════════════════════
-- 7. TaskApproval
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "task_approval" (
  "id"                   TEXT NOT NULL,
  "task_id"              TEXT NOT NULL,
  "reviewer_member_id"   TEXT,
  "approver_member_id"   TEXT,
  "status"               TEXT NOT NULL DEFAULT 'PENDING',
  "review_comment"       TEXT,
  "approval_comment"     TEXT,
  "reviewed_at"          TIMESTAMP(3),
  "approved_at"          TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_approval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_approval_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_approval_reviewer_member_id_fkey" FOREIGN KEY ("reviewer_member_id") REFERENCES "workspace_member"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "task_approval_approver_member_id_fkey" FOREIGN KEY ("approver_member_id") REFERENCES "workspace_member"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "task_approval_task_id_status_idx" ON "task_approval"("task_id", "status");
CREATE INDEX "task_approval_status_created_at_idx" ON "task_approval"("status", "created_at" DESC);

-- ═══════════════════════════════════════════════════════════════
-- 8. LegalDocumentRelation
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "legal_document_relation" (
  "id"               TEXT NOT NULL,
  "from_document_id" TEXT NOT NULL,
  "to_document_id"   TEXT NOT NULL,
  "relation_type"    TEXT NOT NULL,
  "source"           TEXT,
  "confidence"       DOUBLE PRECISION,
  "metadata"         JSONB,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_document_relation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_document_relation_from_document_id_fkey" FOREIGN KEY ("from_document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "legal_document_relation_to_document_id_fkey" FOREIGN KEY ("to_document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "legal_document_relation_from_to_type_key"
  ON "legal_document_relation"("from_document_id", "to_document_id", "relation_type");
CREATE INDEX "legal_document_relation_to_document_id_relation_type_idx"
  ON "legal_document_relation"("to_document_id", "relation_type");

-- ═══════════════════════════════════════════════════════════════
-- 9. RegulatoryTopic + DocumentTopic
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "regulatory_topic" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "parent_id"   TEXT,
  "status"      TEXT NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "regulatory_topic_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "regulatory_topic_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "regulatory_topic"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "regulatory_topic_code_key" ON "regulatory_topic"("code");
CREATE INDEX "regulatory_topic_status_idx" ON "regulatory_topic"("status");

-- 초기 시드
INSERT INTO "regulatory_topic" ("id", "code", "name") VALUES
  ('topic_privacy',            'PRIVACY',            '개인정보 보호'),
  ('topic_labor',              'LABOR',              '노동·인사'),
  ('topic_aml',                'AML',                '자금세탁방지'),
  ('topic_financial_consumer', 'FINANCIAL_CONSUMER', '금융소비자 보호'),
  ('topic_industrial_safety',  'INDUSTRIAL_SAFETY',  '산업안전'),
  ('topic_serious_accident',   'SERIOUS_ACCIDENT',   '중대재해'),
  ('topic_environment',        'ENVIRONMENT',        '환경'),
  ('topic_chemical',           'CHEMICAL',           '화학물질'),
  ('topic_ai',                 'AI',                 '인공지능'),
  ('topic_food',               'FOOD',               '식품'),
  ('topic_medical_device',     'MEDICAL_DEVICE',     '의료기기'),
  ('topic_export_control',     'EXPORT_CONTROL',     '수출통제');

CREATE TABLE "document_topic" (
  "document_id" TEXT NOT NULL,
  "topic_id"    TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_topic_pkey" PRIMARY KEY ("document_id", "topic_id"),
  CONSTRAINT "document_topic_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_topic_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "regulatory_topic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "document_topic_topic_id_idx" ON "document_topic"("topic_id");

-- ═══════════════════════════════════════════════════════════════
-- 10. InternalPolicy + Version + LegalPolicyMapping
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE "internal_policy" (
  "id"                  TEXT NOT NULL,
  "workspace_id"        TEXT NOT NULL,
  "type"                TEXT NOT NULL,
  "title"               TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'ACTIVE',
  "owner_department_id" TEXT,
  "external_url"        TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at"         TIMESTAMP(3),
  CONSTRAINT "internal_policy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "internal_policy_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "internal_policy_owner_department_id_fkey" FOREIGN KEY ("owner_department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "internal_policy_workspace_id_status_idx" ON "internal_policy"("workspace_id", "status");
CREATE INDEX "internal_policy_workspace_id_type_idx" ON "internal_policy"("workspace_id", "type");

CREATE TABLE "internal_policy_version" (
  "id"                    TEXT NOT NULL,
  "policy_id"             TEXT NOT NULL,
  "version_label"         TEXT,
  "effective_date"        TIMESTAMP(3),
  "content_hash"          TEXT,
  "external_url"          TEXT,
  "created_by_member_id"  TEXT,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "internal_policy_version_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "internal_policy_version_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "internal_policy"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "internal_policy_version_policy_id_effective_date_idx"
  ON "internal_policy_version"("policy_id", "effective_date" DESC);

CREATE TABLE "legal_policy_mapping" (
  "id"                    TEXT NOT NULL,
  "workspace_id"          TEXT NOT NULL,
  "document_id"           TEXT NOT NULL,
  "content_unit_id"       TEXT,
  "policy_id"             TEXT NOT NULL,
  "created_by_member_id"  TEXT NOT NULL,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_policy_mapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "legal_policy_mapping_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "legal_policy_mapping_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "legal_policy_mapping_content_unit_id_fkey" FOREIGN KEY ("content_unit_id") REFERENCES "legal_content_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "legal_policy_mapping_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "internal_policy"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "legal_policy_mapping_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "workspace_member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- unique 조합: (workspace, document, contentUnit, policy) — contentUnit이 nullable이라 raw로 partial unique
-- 문서 레벨 mapping: content_unit_id IS NULL
CREATE UNIQUE INDEX "legal_policy_mapping_document_level_unique"
  ON "legal_policy_mapping"("workspace_id", "document_id", "policy_id")
  WHERE "content_unit_id" IS NULL;
-- 조문 레벨 mapping: content_unit_id IS NOT NULL
CREATE UNIQUE INDEX "legal_policy_mapping_unit_level_unique"
  ON "legal_policy_mapping"("workspace_id", "document_id", "content_unit_id", "policy_id")
  WHERE "content_unit_id" IS NOT NULL;
CREATE INDEX "legal_policy_mapping_policy_id_idx" ON "legal_policy_mapping"("policy_id");
CREATE INDEX "legal_policy_mapping_document_id_idx" ON "legal_policy_mapping"("document_id");
