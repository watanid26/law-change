// LegalSource ID 상수 (마이그레이션 v7 시드값과 정확히 일치)
// sourceType (LAW / ADMIN_RULE)로 조회하는 헬퍼

import { prisma } from "@/lib/prisma";

export const LEGAL_SOURCE_ID = {
  LAW: "src_kr_moleg_law",
  ADMIN_RULE: "src_kr_moleg_rule",
} as const;

export type LegalSourceType = "LAW" | "ADMIN_RULE";

const cache = new Map<LegalSourceType, string>();

export async function getLegalSourceId(sourceType: LegalSourceType): Promise<string> {
  const cached = cache.get(sourceType);
  if (cached) return cached;
  const id = LEGAL_SOURCE_ID[sourceType];
  // 존재 검증 (누군가 삭제한 경우 방어)
  const found = await prisma.legalSource.findUnique({ where: { id }, select: { id: true } });
  if (!found) {
    throw new Error(`LegalSource '${id}' not found. Did migration v7 seed run?`);
  }
  cache.set(sourceType, id);
  return id;
}
