import { prisma } from "@/lib/prisma";

export async function listPolicies(workspaceId: string) {
  return prisma.internalPolicy.findMany({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: [{ type: "asc" }, { title: "asc" }],
    select: { id: true, type: true, title: true, externalUrl: true },
  });
}

export async function listMappingsForWatch(workspaceId: string, documentId: string) {
  return prisma.legalPolicyMapping.findMany({
    where: { workspaceId, documentId, contentUnitId: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      policy: { select: { id: true, type: true, title: true, externalUrl: true } },
    },
  });
}
