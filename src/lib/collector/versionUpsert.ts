// 버전 행 생성 — 유일키 전환기 방어.
//
// v13 에서 legal_document_version 의 유일키에 effective_date 가 들어간다
// (분할시행: 같은 공포건이 시행일별로 여러 줄 내려온다).
// 배포와 마이그레이션은 동시에 일어나지 않으므로, 새 코드가 옛 유일키
// (document_id, external_version_id) 위에서 도는 시간이 존재한다.
// 그때 두 번째 시행일 행을 만들려 하면 P2002 로 터진다.
//
// 터뜨리는 대신 옛 동작으로 물러난다 — 이미 있는 행을 그대로 쓴다.
// 마이그레이션이 적용되면 이 갈래는 자연히 안 타게 된다.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function createVersionTolerantly(
  data: Prisma.LegalDocumentVersionUncheckedCreateInput,
) {
  try {
    return await prisma.legalDocumentVersion.create({ data });
  } catch (err) {
    const isUniqueViolation =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    if (!isUniqueViolation) throw err;

    const existing = await prisma.legalDocumentVersion.findFirst({
      where: {
        documentId: data.documentId,
        externalVersionId: data.externalVersionId,
      },
    });
    if (!existing) throw err;
    return existing;
  }
}

/**
 * 문서의 last_change_at(최신 개정일)을 다시 계산해 올린다.
 *
 * 목록의 기본 정렬이 이 값을 쓴다. 버전을 만들거나 고친 뒤 반드시 불러야
 * 한다 — 안 부르면 새 개정이 목록 맨 위로 안 올라온다.
 * 증분(더 크면 갱신)이 아니라 다시 계산하는 이유는, 버전이 지워지거나
 * 날짜가 정정되는 경우에도 값이 맞아야 하기 때문이다.
 */
export async function refreshLastChangeAt(documentId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "legal_document" d
    SET "last_change_at" = v.last_change
    FROM (
      SELECT GREATEST(MAX(promulgation_date), MAX(issuance_date)) AS last_change
      FROM "legal_document_version"
      WHERE document_id = ${documentId}
    ) v
    WHERE d."id" = ${documentId}`;
}
