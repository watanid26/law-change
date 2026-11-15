import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const targets = ["개인정보 보호법", "산업안전보건법", "식품위생법", "부동산등기법", "게임산업진흥에 관한 법률"];
  for (const t of targets) {
    const doc = await p.legalDocument.findFirst({
      where: { currentTitle: { contains: t } },
      select: { externalDocumentId: true, currentTitle: true, currentAgencyName: true },
    });
    console.log(`${doc?.externalDocumentId ?? "-"}\t${doc?.currentTitle ?? "(없음)"}\t${doc?.currentAgencyName ?? ""}`);
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
