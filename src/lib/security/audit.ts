import { prisma } from "@/lib/prisma";

export interface AuditEntry {
  actor: string;
  action: string;
  target?: string;
  beforeStatus?: string;
  afterStatus?: string;
  payload?: unknown;
  outcome?: "success" | "conflict" | "error";
  errorMessage?: string;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      actor: entry.actor,
      action: entry.action,
      target: entry.target ?? null,
      beforeStatus: entry.beforeStatus ?? null,
      afterStatus: entry.afterStatus ?? null,
      payload: (entry.payload as object | undefined) ?? undefined,
      outcome: entry.outcome ?? "success",
      errorMessage: entry.errorMessage ?? null,
    },
  });
}
