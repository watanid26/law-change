// Integration test: 법령 corpus cross-document 결합 원천 차단
// LegalChangeEvent, LegalContentUnitVersion, LegalDiff 는 반드시 같은 documentId 로만 이어져야 한다.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const TEST_PREFIX = "TEST_CORPUS_";
const LAW_SOURCE = "src_kr_moleg_law";

interface DocFixture {
  doc: string;
  ver: string;
  contentUnit: string;
  cuv: string;
}

async function makeDoc(label: string): Promise<DocFixture> {
  const suffix = `${TEST_PREFIX}${label}_${randomUUID().slice(0, 6)}`;
  const doc = await prisma.legalDocument.create({
    data: {
      legalSourceId: LAW_SOURCE,
      externalDocumentId: suffix,
      documentType: "법률",
      currentTitle: `테스트 문서 ${suffix}`,
    },
  });
  const ver = await prisma.legalDocumentVersion.create({
    data: {
      documentId: doc.id,
      externalVersionId: `${suffix}_v1`,
      revisionType: "제정",
      contentHash: `h_${suffix}`,
    },
  });
  const contentUnit = await prisma.legalContentUnit.create({
    data: { documentId: doc.id, unitType: "ARTICLE", canonicalKey: `art1_${suffix}` },
  });
  const cuv = await prisma.legalContentUnitVersion.create({
    data: {
      documentId: doc.id,
      contentUnitId: contentUnit.id,
      documentVersionId: ver.id,
      sourceKey: `art1_${suffix}`,
      unitOrder: 1,
      contentText: "본문",
      contentHash: `ch_${suffix}`,
    },
  });
  return { doc: doc.id, ver: ver.id, contentUnit: contentUnit.id, cuv: cuv.id };
}

async function cleanupDocs() {
  await prisma.legalDocument.deleteMany({
    where: { externalDocumentId: { startsWith: TEST_PREFIX } },
  });
}

let A: DocFixture;
let B: DocFixture;

beforeAll(async () => {
  await cleanupDocs();
  A = await makeDoc("A");
  B = await makeDoc("B");
});

afterAll(async () => {
  await cleanupDocs();
  await prisma.$disconnect();
});

// ────────────────────────────────────────────────────────────────
describe("LegalContentUnitVersion cross-document 차단", () => {
  it("Document A ContentUnit + Document A Version: 성공", async () => {
    const cu2 = await prisma.legalContentUnit.create({
      data: { documentId: A.doc, unitType: "ARTICLE", canonicalKey: `art2_${randomUUID().slice(0,4)}` },
    });
    const cuv = await prisma.legalContentUnitVersion.create({
      data: {
        documentId: A.doc,
        contentUnitId: cu2.id,
        documentVersionId: A.ver,
        sourceKey: `art2`,
        unitOrder: 2,
        contentText: "본문 2",
        contentHash: `h2_${randomUUID().slice(0,4)}`,
      },
    });
    expect(cuv.id).toBeTruthy();
  });

  it("Document A ContentUnit + Document B Version: 실패", async () => {
    await expect(
      prisma.legalContentUnitVersion.create({
        data: {
          documentId: A.doc,
          contentUnitId: A.contentUnit,
          documentVersionId: B.ver, // 다른 문서의 version
          sourceKey: `bad1`,
          unitOrder: 99,
          contentText: "x",
          contentHash: `bad_${randomUUID().slice(0,4)}`,
        },
      }),
    ).rejects.toThrow();
  });

  it("documentId 불일치 (A ContentUnit + B documentId): 실패", async () => {
    await expect(
      prisma.legalContentUnitVersion.create({
        data: {
          documentId: B.doc,           // B 라고 주장
          contentUnitId: A.contentUnit, // 실제는 A
          documentVersionId: B.ver,
          sourceKey: `bad2`,
          unitOrder: 99,
          contentText: "x",
          contentHash: `bad_${randomUUID().slice(0,4)}`,
        },
      }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
describe("LegalChangeEvent cross-document 차단", () => {
  it("Document A + A versions: 성공", async () => {
    const ver2 = await prisma.legalDocumentVersion.create({
      data: {
        documentId: A.doc,
        externalVersionId: `${A.doc}_v2_${randomUUID().slice(0,4)}`,
        revisionType: "일부개정",
        contentHash: `h_${randomUUID().slice(0,4)}`,
      },
    });
    const evt = await prisma.legalChangeEvent.create({
      data: {
        documentId: A.doc,
        previousVersionId: A.ver,
        newVersionId: ver2.id,
        eventType: "REVISION",
      },
    });
    expect(evt.id).toBeTruthy();
    await prisma.legalChangeEvent.delete({ where: { id: evt.id } });
    await prisma.legalDocumentVersion.delete({ where: { id: ver2.id } });
  });

  it("Document A + previousVersion from Document B: 실패", async () => {
    const ver2 = await prisma.legalDocumentVersion.create({
      data: {
        documentId: A.doc,
        externalVersionId: `${A.doc}_v2_${randomUUID().slice(0,4)}`,
        revisionType: "일부개정",
        contentHash: `h_${randomUUID().slice(0,4)}`,
      },
    });
    await expect(
      prisma.legalChangeEvent.create({
        data: {
          documentId: A.doc,
          previousVersionId: B.ver, // 다른 문서
          newVersionId: ver2.id,
          eventType: "REVISION",
        },
      }),
    ).rejects.toThrow();
    await prisma.legalDocumentVersion.delete({ where: { id: ver2.id } });
  });

  it("Document A + newVersion from Document B: 실패", async () => {
    await expect(
      prisma.legalChangeEvent.create({
        data: {
          documentId: A.doc,
          newVersionId: B.ver, // 다른 문서
          eventType: "FIRST_ISSUE",
        },
      }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
describe("LegalDiff cross-document 차단", () => {
  let evtA: { id: string };

  beforeAll(async () => {
    // Document A 를 위한 event 준비
    const ver2 = await prisma.legalDocumentVersion.create({
      data: {
        documentId: A.doc,
        externalVersionId: `${A.doc}_diffver_${randomUUID().slice(0,4)}`,
        revisionType: "일부개정",
        contentHash: `hd_${randomUUID().slice(0,4)}`,
      },
    });
    evtA = await prisma.legalChangeEvent.create({
      data: {
        documentId: A.doc,
        previousVersionId: A.ver,
        newVersionId: ver2.id,
        eventType: "REVISION",
      },
    });
  });

  it("same document contentUnit + version: 성공", async () => {
    const d = await prisma.legalDiff.create({
      data: {
        documentId: A.doc,
        changeEventId: evtA.id,
        contentUnitId: A.contentUnit,
        newContentUnitVersionId: A.cuv,
        changeType: "MODIFIED",
      },
    });
    expect(d.id).toBeTruthy();
    await prisma.legalDiff.delete({ where: { id: d.id } });
  });

  it("cross-document contentUnit (Document A event + Document B contentUnit): 실패", async () => {
    await expect(
      prisma.legalDiff.create({
        data: {
          documentId: A.doc,
          changeEventId: evtA.id,
          contentUnitId: B.contentUnit, // 다른 문서
          changeType: "MODIFIED",
        },
      }),
    ).rejects.toThrow();
  });

  it("cross-document contentUnitVersion: 실패", async () => {
    await expect(
      prisma.legalDiff.create({
        data: {
          documentId: A.doc,
          changeEventId: evtA.id,
          newContentUnitVersionId: B.cuv, // 다른 문서
          changeType: "MODIFIED",
        },
      }),
    ).rejects.toThrow();
  });

  it("cross-document changeEvent: 실패 (documentId=B 라면서 A event)", async () => {
    await expect(
      prisma.legalDiff.create({
        data: {
          documentId: B.doc,           // B 라고 주장
          changeEventId: evtA.id,      // 실제는 A
          changeType: "MODIFIED",
        },
      }),
    ).rejects.toThrow();
  });
});
