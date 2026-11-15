-- Pre-v8 defensive cleanup — Round 4.6 문서화
--
-- 배경:
--   v8 (schema_v8_r44) 은 reconciliation_progress 에
--   partial unique index (source_type WHERE status = 'RUNNING') 를 만든다.
--   v9 (schema_v9_r45_tenant_integrity) 는 duplicate RUNNING 세션을 정리한다.
--
-- 문제:
--   Migration chain 순서상 v8 이 먼저다. 만약 v7 상태의 DB 에
--   같은 source_type 으로 RUNNING 이 2개 이상이면 v8 이 실패한다.
--
-- 이 스크립트:
--   v7 → v8 migration 을 실행하기 전에 duplicate RUNNING 을 정리하여
--   v8 의 partial unique index 생성이 실패하지 않도록 한다.
--
-- 사용법:
--   psql "$DATABASE_URL" -f scripts/db/pre-v8-reconciliation-cleanup.sql
--   ...후 prisma migrate deploy 를 실행.
--
-- Fresh install / clean DB / 이미 v8+ 인 DB 에서는 안전한 no-op.

BEGIN;

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
       last_error  = COALESCE(rp.last_error, 'DUPLICATE_ACTIVE_SESSION_PRE_V8_CLEANUP'),
       locked_at   = NULL,
       locked_by   = NULL
  FROM ranked r
 WHERE rp.id = r.id
   AND r.rn > 1;

COMMIT;
