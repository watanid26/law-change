#!/usr/bin/env tsx
// 초기 시드 스크립트: 법령명 리스트로 문서 확보 후 큐 소진까지 처리
// 사용법: npm run seed [법령명 ...]

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { runInitialSeed } from "@/lib/collector/orchestrator";
import { prisma } from "@/lib/prisma";

const DEFAULT_LAWS = [
  "개인정보 보호법",
  "개인정보 보호법 시행령",
  "정보통신망 이용촉진 및 정보보호 등에 관한 법률",
];

async function main() {
  const args = process.argv.slice(2);
  const names = args.length > 0 ? args : DEFAULT_LAWS;

  console.log("=".repeat(60));
  console.log("LawChange 시드 (initial catalog + drain queue)");
  console.log("=".repeat(60));
  names.forEach((n) => console.log(`  · ${n}`));
  console.log();

  const start = Date.now();
  const report = await runInitialSeed(names);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log();
  console.log("=".repeat(60));
  console.log(`완료 (run=${report.runId}, ${elapsed}s)`);
  console.log("=".repeat(60));
  console.log(`카탈로그: scanned=${report.catalog.scanned}, new=${report.catalog.newDocuments}, changed=${report.catalog.changedDocuments}, enqueued=${report.catalog.enqueued}`);
  console.log(`상세     : processed=${report.detail.processed}, succeeded=${report.detail.succeeded}, failed=${report.detail.failed}`);

  if (report.detail.failed > 0 && report.detail.succeeded === 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
