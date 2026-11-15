// Integration test: 스키마 v7 제약 & 이벤트 discovery type

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_PREFIX = "TEST_SCHEMA_";
const LAW_SOURCE = "src_kr_moleg_law";
const RULE_SOURCE = "src_kr_moleg_rule";

async function cleanup() {
  await prisma.legalDocument.deleteMany({
    where: { externalDocumentId: { startsWith: TEST_PREFIX } },
  });
}

beforeEach(async () => await cleanup());
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("스키마 v7 제약", () => {
  it("(document_id, external_version_id) unique — 같은 문서 내 같은 버전 재저장 실패", async () => {
    const doc = await prisma.legalDocument.create({
      data: {
        legalSourceId: LAW_SOURCE,
        externalDocumentId: `${TEST_PREFIX}dupver_${Date.now()}`,
        documentType: "법률",
        currentTitle: "테스트 법령",
      },
    });
    await prisma.legalDocumentVersion.create({
      data: {
        documentId: doc.id,
        externalVersionId: "VER-1",
        revisionType: "제정",
        contentHash: "h",
      },
    });
    await expect(
      prisma.legalDocumentVersion.create({
        data: {
          documentId: doc.id,
          externalVersionId: "VER-1",
          revisionType: "제정",
          contentHash: "h",
        },
      }),
    ).rejects.toThrow();
  });

  it("다른 문서에는 동일 external_version_id 가능 (전역 unique 아님)", async () => {
    const d1 = await prisma.legalDocument.create({
      data: {
        legalSourceId: LAW_SOURCE,
        externalDocumentId: `${TEST_PREFIX}sameverA_${Date.now()}`,
        documentType: "법률",
        currentTitle: "A",
      },
    });
    const d2 = await prisma.legalDocument.create({
      data: {
        legalSourceId: RULE_SOURCE,
        externalDocumentId: `${TEST_PREFIX}sameverB_${Date.now()}`,
        documentType: "고시",
        currentTitle: "B",
      },
    });
    const shared = `SHARED-VER-${Date.now()}`;
    await prisma.legalDocumentVersion.create({
      data: { documentId: d1.id, externalVersionId: shared, revisionType: "제정", contentHash: "h1" },
    });
    await expect(
      prisma.legalDocumentVersion.create({
        data: { documentId: d2.id, externalVersionId: shared, revisionType: "제정", contentHash: "h2" },
      }),
    ).resolves.toBeTruthy();
  });

  it("LegalChangeEvent.discoveryType 기본값 = LIVE_DETECTION, notificationEligible=true", async () => {
    const doc = await prisma.legalDocument.create({
      data: {
        legalSourceId: LAW_SOURCE,
        externalDocumentId: `${TEST_PREFIX}evt_${Date.now()}`,
        documentType: "법률",
        currentTitle: "이벤트 테스트",
      },
    });
    const ver = await prisma.legalDocumentVersion.create({
      data: { documentId: doc.id, externalVersionId: "V1", revisionType: "제정", contentHash: "h" },
    });
    const evt = await prisma.legalChangeEvent.create({
      data: {
        documentId: doc.id,
        newVersionId: ver.id,
        eventType: "FIRST_ISSUE",
      },
    });
    expect(evt.discoveryType).toBe("LIVE_DETECTION");
    expect(evt.notificationEligible).toBe(true);
  });

  it("HISTORICAL_IMPORT 이벤트는 notificationEligible=false로 저장 가능", async () => {
    const doc = await prisma.legalDocument.create({
      data: {
        legalSourceId: LAW_SOURCE,
        externalDocumentId: `${TEST_PREFIX}histevt_${Date.now()}`,
        documentType: "법률",
        currentTitle: "히스토리",
      },
    });
    const ver = await prisma.legalDocumentVersion.create({
      data: { documentId: doc.id, externalVersionId: "V1", revisionType: "제정", contentHash: "h" },
    });
    const evt = await prisma.legalChangeEvent.create({
      data: {
        documentId: doc.id,
        newVersionId: ver.id,
        eventType: "REVISION",
        discoveryType: "HISTORICAL_IMPORT",
        notificationEligible: false,
      },
    });
    expect(evt.discoveryType).toBe("HISTORICAL_IMPORT");
    expect(evt.notificationEligible).toBe(false);
  });

  it("(document_id, unit_type, canonical_key) unique — 같은 canonical_key 중복 실패", async () => {
    const doc = await prisma.legalDocument.create({
      data: {
        legalSourceId: LAW_SOURCE,
        externalDocumentId: `${TEST_PREFIX}unit_${Date.now()}`,
        documentType: "법률",
        currentTitle: "unit test",
      },
    });
    await prisma.legalContentUnit.create({
      data: { documentId: doc.id, unitType: "ARTICLE", canonicalKey: "0001000" },
    });
    await expect(
      prisma.legalContentUnit.create({
        data: { documentId: doc.id, unitType: "ARTICLE", canonicalKey: "0001000" },
      }),
    ).rejects.toThrow();
  });
});
