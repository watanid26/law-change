// 저장된 데이터가 조문 전문까지인지 실측.
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const [units, unitVersions, diffs] = await Promise.all([
    p.legalContentUnit.count(),
    p.legalContentUnitVersion.count(),
    p.legalDiff.count(),
  ]);
  console.log(`legalContentUnit (조문/부칙 단위):        ${units}`);
  console.log(`legalContentUnitVersion (조문 버전+본문): ${unitVersions}`);
  console.log(`legalDiff (조문간 diff):                  ${diffs}`);

  const sampleDoc = await p.legalDocument.findFirst({
    where: { currentTitle: { contains: "개인정보" } },
    select: { id: true, currentTitle: true },
  });
  if (!sampleDoc) { console.log("샘플 문서 없음"); return; }
  console.log(`\n=== 샘플 문서: ${sampleDoc.currentTitle} ===`);

  const units5 = await p.legalContentUnit.findMany({
    where: { documentId: sampleDoc.id },
    take: 5,
    orderBy: { canonicalKey: "asc" },
    select: {
      unitType: true,
      canonicalKey: true,
      currentLabel: true,
      versions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { unitTitle: true, contentText: true },
      },
    },
  });
  console.log(`조문 샘플 5개:`);
  for (const u of units5) {
    const v = u.versions[0];
    const body = v?.contentText ?? "";
    const preview = body.slice(0, 120).replace(/\n/g, " ");
    console.log(`  [${u.unitType}] ${u.currentLabel ?? u.canonicalKey} — ${v?.unitTitle ?? ""}`);
    console.log(`    본문(${body.length}자): ${preview}${body.length > 120 ? "..." : ""}`);
  }
  await p.$disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
