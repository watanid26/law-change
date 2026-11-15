-- 사규 본문. 근거 법령 자동 추출에 필요하다.
-- prisma migrate diff 는 라이브 DB 드리프트 때문에 기존 테이블 DROP 을
-- 포함한 스크립트를 만든다. 손으로 쓴다.
ALTER TABLE "internal_policy_version" ADD COLUMN IF NOT EXISTS "content_text" TEXT;
