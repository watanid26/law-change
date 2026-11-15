import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const [docs, versions, events, bootstraps] = await Promise.all([
    p.legalDocument.count(),
    p.legalDocumentVersion.count(),
    p.legalChangeEvent.count(),
    p.bootstrapProgress.findMany({
      select: {
        sourceType: true, scope: true, cursorPage: true, status: true,
        rawScannedCount: true, matchedCount: true, totalCount: true,
      },
    }),
  ]);
  console.log(`legalDocument:        ${docs}`);
  console.log(`legalDocumentVersion: ${versions}`);
  console.log(`legalChangeEvent:     ${events}`);
  console.log(`\nBootstrapProgress:`);
  for (const b of bootstraps) console.log(`  ${b.sourceType} scope=${b.scope} status=${b.status} cursor=${b.cursorPage} rawScanned=${b.rawScannedCount} matched=${b.matchedCount} total=${b.totalCount}`);
  await p.$disconnect();
}
main().catch(err => { console.error(err); process.exit(1); });
