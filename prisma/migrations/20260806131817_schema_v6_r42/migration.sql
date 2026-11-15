-- Schema v6 (Round 4.2)
-- - BootstrapProgress.already_active_count 추가
--   실제 enqueue 성공(신규 큐잉)과 already_active(이미 활성 존재로 스킵)를 분리해 카운트

ALTER TABLE "bootstrap_progress"
  ADD COLUMN "already_active_count" INTEGER NOT NULL DEFAULT 0;
