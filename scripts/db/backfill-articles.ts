// 항 배열 파싱 버그(commit 65f1fad 이전) 로 저장된 조문 본문을 재파싱한다.
//
// 전략:
//   - 각 LegalDocument 의 최신 LegalDocumentVersion 을 대상 (전 이력 재수집은 과함)
//   - detail API 재호출 → 수정된 normalize 로 재파싱 → 각 조문 contentText 를 update
//   - LegalDocument/LegalDocumentVersion/LegalChangeEvent 는 절대 건드리지 않음
//     (unique 제약과 관계 무결성 유지)
//
// 사용:
//   set -a; source .env.local; set +a
//   npx tsx --require ./scripts/db/_bypass-server-only.cjs scripts/db/backfill-articles.ts
//   LIMIT=50 FROM=0 ONLY=LAW ...

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { fetchEflawDetail } from "../../src/lib/law-api/client";
import { fetchAdminRuleDetail } from "../../src/lib/admin-rule-api/client";
import { normalizeArticles } from "../../src/lib/law-api/normalize";
import { LEGAL_SOURCE_ID } from "../../src/lib/law-api/sources";

const LIMIT = Number(process.env.LIMIT ?? "0"); // 0 = 무제한
const FROM = Number(process.env.FROM ?? "0");
const ONLY = (process.env.ONLY ?? "").toUpperCase() as "" | "LAW" | "ADMIN_RULE";
const PAUSE_MS = Number(process.env.PAUSE_MS ?? "150");

async function main() {
  const srcLaw = LEGAL_SOURCE_ID.LAW;
  const srcAdmin = LEGAL_SOURCE_ID.ADMIN_RULE;

  const where: Record<string, unknown> = {};
  if (ONLY === "LAW") where.legalSourceId = srcLaw;
  else if (ONLY === "ADMIN_RULE") where.legalSourceId = srcAdmin;

  const total = await prisma.legalDocument.count({ where });
  console.log(`[backfill] target=${total}건 (ONLY=${ONLY || "ALL"}, FROM=${FROM}, LIMIT=${LIMIT || "∞"})`);

  const docs = await prisma.legalDocument.findMany({
    where,
    orderBy: { createdAt: "asc" },
    skip: FROM,
    take: LIMIT > 0 ? LIMIT : undefined,
    select: {
      id: true,
      externalDocumentId: true,
      currentTitle: true,
      legalSourceId: true,
    },
  });

  const start = Date.now();
  let ok = 0;
  let fail = 0;
  let skipped = 0;
  let versionsFixed = 0;
  let articlesUpdated = 0;
  let processed = 0;

  for (const doc of docs) {
    processed += 1;
    const isLaw = doc.legalSourceId === srcLaw;

    try {
      // 최신 version 만 대상 (전 이력은 이미 상세 저장돼 있고 변경 없음)
      const latest = await prisma.legalDocumentVersion.findFirst({
        where: { documentId: doc.id },
        orderBy: [{ promulgationDate: "desc" }, { issuanceDate: "desc" }],
        select: { id: true, externalVersionId: true, effectiveDate: true, issuanceDate: true },
      });
      if (!latest) {
        skipped += 1;
        continue;
      }

      // API 재호출 → normalize
      let articleUnits: unknown;
      if (isLaw) {
        const eflaw = latest.effectiveDate
          ? new Date(latest.effectiveDate).toISOString().slice(0, 10).replace(/-/g, "")
          : undefined;
        const detail = await fetchEflawDetail(latest.externalVersionId, eflaw);
        articleUnits = detail?.법령?.조문?.조문단위;
      } else {
        // AdminRuleDetailResponse 타입이 최신 필드를 반영하지 않아 우회.
        // (스크립트 전용 · 프로덕션 빌드 통과를 위한 임시 완화.)
        const detail = (await fetchAdminRuleDetail(latest.externalVersionId)) as unknown as {
          행정규칙?: { 조문?: { 조문단위?: unknown } };
        } | null | undefined;
        articleUnits = detail?.행정규칙?.조문?.조문단위;
      }

      if (!articleUnits) {
        skipped += 1;
        continue;
      }

      const normalized = normalizeArticles(articleUnits as never).filter((a) => a.isRealArticle);

      // 각 조문 contentText 재파싱값으로 update (contentHash 도 함께 갱신)
      let updatedThisDoc = 0;
      for (const a of normalized) {
        const res = await prisma.legalContentUnitVersion.updateMany({
          where: {
            documentVersionId: latest.id,
            sourceKey: a.articleKey,
          },
          data: {
            contentText: a.articleText,
            contentHash: a.articleHash,
            unitNumber: a.articleNumber,
            unitTitle: a.articleTitle,
          },
        });
        updatedThisDoc += res.count;
      }
      articlesUpdated += updatedThisDoc;
      versionsFixed += 1;
      ok += 1;
    } catch (err) {
      fail += 1;
      console.error(`[backfill] FAIL ${doc.externalDocumentId} (${doc.currentTitle}):`, (err as Error).message);
    }

    if (processed % 20 === 0 || processed === docs.length) {
      const rate = processed / ((Date.now() - start) / 1000);
      const eta = docs.length > processed ? Math.round((docs.length - processed) / rate) : 0;
      console.log(
        `[backfill] ${processed}/${docs.length} ok=${ok} fail=${fail} skip=${skipped} · versions=${versionsFixed} arts=${articlesUpdated} · ${rate.toFixed(2)}건/s · ETA ${eta}s`,
      );
    }

    if (PAUSE_MS > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  const elapsed = (Date.now() - start) / 1000;
  console.log(
    `[backfill] done ${processed}건 · ok=${ok} fail=${fail} skip=${skipped} · versions=${versionsFixed} arts=${articlesUpdated} · ${elapsed.toFixed(1)}s`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill] threw:", err);
  process.exit(1);
});
