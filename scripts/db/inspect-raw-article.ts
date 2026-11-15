// 개인정보 보호법 제3조 처럼 본문 15자짜리 조문의 raw API 응답이 어떻게 생겼는지 확인.
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const doc = await p.legalDocument.findFirst({
    where: { currentTitle: "개인정보 보호법" },
    select: { id: true },
  });
  if (!doc) return;

  const version = await p.legalDocumentVersion.findFirst({
    where: { documentId: doc.id },
    orderBy: [{ promulgationDate: "desc" }],
    select: { id: true, normalizedContent: true },
  });
  if (!version || !version.normalizedContent) {
    console.log("normalizedContent 없음");
    return;
  }
  const nc: any = version.normalizedContent;
  const articles: any[] = nc?.조문?.조문단위 ?? [];
  const arr = Array.isArray(articles) ? articles : [articles];

  // 제3조 찾기
  const art3 = arr.find((a) => String(a?.조문번호) === "3");
  const art5 = arr.find((a) => String(a?.조문번호) === "5");

  // 상위 키 살펴보기
  console.log("normalizedContent top keys:", Object.keys(nc));
  console.log("조문 keys:", nc?.조문 ? Object.keys(nc.조문) : "no 조문");
  console.log("조문단위 type:", Array.isArray(articles) ? `Array[${articles.length}]` : typeof articles);
  console.log("총 조문 갯수 (arr):", arr.length);
  console.log("샘플 조문번호들:", arr.slice(0, 10).map(a => a?.조문번호));

  console.log("\n=== 제3조 raw ===");
  console.log(art3 ? JSON.stringify(art3, null, 2).slice(0, 3000) : "not found");
  console.log("\n=== 제5조 raw ===");
  console.log(art5 ? JSON.stringify(art5, null, 2).slice(0, 3000) : "not found");

  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
