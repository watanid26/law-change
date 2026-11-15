import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth/session";
import { buildWatchesWorkbook } from "@/lib/export/excel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const ctx = await requireUserContext();
  const wb = await buildWatchesWorkbook(ctx.workspaceId);
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `applicable-laws-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
