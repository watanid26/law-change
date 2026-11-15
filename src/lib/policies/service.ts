// InternalPolicy + LegalPolicyMapping 서비스.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CreatePolicyInput, BulkCreatePoliciesInput } from "./validation";

export class PolicyServiceError extends Error {
  code:
    | "POLICY_NOT_FOUND"
    | "WATCH_NOT_FOUND"
    | "MAPPING_NOT_FOUND"
    | "DOCUMENT_NOT_FOUND"
    | "CONTENT_UNIT_NOT_FOUND";
  constructor(code: PolicyServiceError["code"], message?: string) {
    super(message ?? code);
    this.name = "PolicyServiceError";
    this.code = code;
  }
}

export interface PolicyContext { workspaceId: string; memberId: string; }

export async function createPolicy(ctx: PolicyContext, input: CreatePolicyInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const p = await tx.internalPolicy.create({
      data: {
        workspaceId: ctx.workspaceId,
        type: input.type,
        title: input.title,
        externalUrl: input.externalUrl ?? null,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    await writeAudit(tx, ctx, "POLICY_CREATED", p.id, "InternalPolicy", {
      after: { type: input.type, title: input.title },
    });
    return p;
  });
}

// 라운드 19-B2: 사규 벌크 생성. 심사 지적 [FRICTION]: "15건 등록 = 모달 15번" 대응.
// 한 트랜잭션에 최대 200건. 실패 시 전체 롤백 (부분 성공 없음 — 사용자 예측 가능성).
export async function bulkCreatePolicies(
  ctx: PolicyContext,
  input: BulkCreatePoliciesInput,
): Promise<{ createdCount: number }> {
  return prisma.$transaction(async (tx) => {
    let count = 0;
    for (const item of input.items) {
      const p = await tx.internalPolicy.create({
        data: {
          workspaceId: ctx.workspaceId,
          type: item.type,
          title: item.title,
          externalUrl: item.externalUrl ?? null,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      await writeAudit(tx, ctx, "POLICY_CREATED", p.id, "InternalPolicy", {
        after: { type: item.type, title: item.title, source: "bulk" },
      });
      count += 1;
    }
    return { createdCount: count };
  });
}

// Watch 로부터 mapping 생성 — Watch.documentId 를 자동으로 사용, tenant/document consistency 보장.
export async function mapPolicyToWatch(
  ctx: PolicyContext,
  watchId: string,
  policyId: string,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const w = await tx.watch.findFirst({
      where: { id: watchId, workspaceId: ctx.workspaceId },
      select: { id: true, documentId: true },
    });
    if (!w) throw new PolicyServiceError("WATCH_NOT_FOUND");

    const p = await tx.internalPolicy.findFirst({
      where: { id: policyId, workspaceId: ctx.workspaceId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!p) throw new PolicyServiceError("POLICY_NOT_FOUND");

    // upsert 로 idempotent
    const existing = await tx.legalPolicyMapping.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        documentId: w.documentId,
        policyId: p.id,
        contentUnitId: null,
      },
      select: { id: true },
    });
    if (existing) return existing;

    const m = await tx.legalPolicyMapping.create({
      data: {
        workspaceId: ctx.workspaceId,
        documentId: w.documentId,
        policyId: p.id,
        createdByMemberId: ctx.memberId,
      },
      select: { id: true },
    });
    await writeAudit(tx, ctx, "POLICY_MAPPING_CREATED", m.id, "LegalPolicyMapping", {
      after: { watchId: w.id, policyId: p.id },
    });
    return m;
  });
}

// 조문 단위 연결. mapPolicyToWatch 는 관심 법령에서 법령 단위로만 걸 수
// 있었다. 개정 영향을 정확히 판정하려면 조문까지 걸려야 한다 —
// "근로기준법이 바뀜" 이 아니라 "제53조가 바뀜 → 취업규칙 제18조" 여야
// 담당자가 볼 만한 목록이 된다.
export async function mapPolicyToArticle(
  ctx: PolicyContext,
  input: { policyId: string; documentId: string; contentUnitId?: string | null },
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const p = await tx.internalPolicy.findFirst({
      where: { id: input.policyId, workspaceId: ctx.workspaceId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!p) throw new PolicyServiceError("POLICY_NOT_FOUND");

    const doc = await tx.legalDocument.findUnique({
      where: { id: input.documentId },
      select: { id: true },
    });
    if (!doc) throw new PolicyServiceError("DOCUMENT_NOT_FOUND");

    // 조문은 반드시 그 법령의 것이어야 한다. 다른 법령의 조문 id 가 들어오면
    // 개정 영향 판정이 통째로 어긋난다.
    let contentUnitId: string | null = null;
    if (input.contentUnitId) {
      const unit = await tx.legalContentUnit.findFirst({
        where: { id: input.contentUnitId, documentId: doc.id },
        select: { id: true },
      });
      if (!unit) throw new PolicyServiceError("CONTENT_UNIT_NOT_FOUND");
      contentUnitId = unit.id;
    }

    const existing = await tx.legalPolicyMapping.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        documentId: doc.id,
        policyId: p.id,
        contentUnitId,
      },
      select: { id: true },
    });
    if (existing) return existing;

    const m = await tx.legalPolicyMapping.create({
      data: {
        workspaceId: ctx.workspaceId,
        documentId: doc.id,
        policyId: p.id,
        contentUnitId,
        createdByMemberId: ctx.memberId,
      },
      select: { id: true },
    });
    await writeAudit(tx, ctx, "POLICY_MAPPING_CREATED", m.id, "LegalPolicyMapping", {
      after: { documentId: doc.id, contentUnitId, policyId: p.id, source: "article" },
    });
    return m;
  });
}

// 사규 본문 저장. 본문이 있어야 근거 법령을 뽑을 수 있다.
export async function savePolicyContent(
  ctx: PolicyContext,
  policyId: string,
  contentText: string,
): Promise<{ versionId: string }> {
  return prisma.$transaction(async (tx) => {
    const p = await tx.internalPolicy.findFirst({
      where: { id: policyId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!p) throw new PolicyServiceError("POLICY_NOT_FOUND");

    const v = await tx.internalPolicyVersion.create({
      data: {
        workspaceId: ctx.workspaceId,
        policyId: p.id,
        contentText,
        createdByMemberId: ctx.memberId,
      },
      select: { id: true },
    });
    await writeAudit(tx, ctx, "POLICY_CONTENT_SAVED", p.id, "InternalPolicy", {
      after: { versionId: v.id, length: contentText.length },
    });
    return { versionId: v.id };
  });
}

export async function removeMapping(ctx: PolicyContext, mappingId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const m = await tx.legalPolicyMapping.findFirst({
      where: { id: mappingId, workspaceId: ctx.workspaceId },
      select: { id: true, policyId: true, documentId: true },
    });
    if (!m) throw new PolicyServiceError("MAPPING_NOT_FOUND");
    await tx.legalPolicyMapping.delete({ where: { id: m.id } });
    await writeAudit(tx, ctx, "POLICY_MAPPING_REMOVED", m.id, "LegalPolicyMapping", {
      before: { policyId: m.policyId, documentId: m.documentId },
    });
  });
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  ctx: PolicyContext,
  action: string,
  entityId: string,
  entityType: "InternalPolicy" | "LegalPolicyMapping",
  data: { before?: Record<string, unknown>; after?: Record<string, unknown> },
) {
  await tx.workspaceAuditLog.create({
    data: {
      workspaceId: ctx.workspaceId,
      actorMemberId: ctx.memberId,
      action,
      entityType,
      entityId,
      beforeData: (data.before ?? undefined) as Prisma.InputJsonValue | undefined,
      afterData: (data.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
