// 배포 후 설정 검증용 health check.
// 각 외부 의존성 (DB, Supabase Storage, Resend) 이 실제로 구성되었는지 확인.
//
// 인증: admin HMAC 쿠키 (같은 정보를 노출하지 않도록 access 제한).
// 사용법: /admin/login 후 브라우저에서 /api/health/config 접근.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminSession } from "@/lib/security/auth";
import { EVIDENCE_BUCKET } from "@/lib/storage/supabase-storage";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface CheckResult {
  ok: boolean;
  detail?: string;
}

export async function GET() {
  // Admin 쿠키 검증 — 미인증이면 401
  const session = checkAdminSession();
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: "admin required" }, { status: 401 });
  }

  const checks: Record<string, CheckResult> = {};

  // 1) DB 연결 + prisma
  checks.database = await checkDatabase();

  // 2) Supabase env vars 존재
  checks.supabaseEnv = checkSupabaseEnv();

  // 3) Supabase Storage 버킷 존재
  checks.storage = await checkStorage();

  // 4) Resend 설정
  checks.email = checkEmail();

  // 5) Cron secret 설정
  checks.cronSecret = { ok: !!process.env.CRON_SECRET, detail: process.env.CRON_SECRET ? undefined : "missing" };

  // 6) Law API
  checks.lawApi = { ok: !!process.env.LAW_API_OC, detail: process.env.LAW_API_OC ? undefined : "LAW_API_OC missing" };

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 503 });
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const r = await prisma.$queryRaw<Array<{ n: number }>>`SELECT 1 AS n`;
    return { ok: r.length === 1 };
  } catch (err) {
    return { ok: false, detail: (err as Error).message?.slice(0, 200) };
  }
}

function checkSupabaseEnv(): CheckResult {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing.length === 0 ? { ok: true } : { ok: false, detail: `missing: ${missing.join(", ")}` };
}

async function checkStorage(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, detail: "supabase env not configured" };
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // 버킷 리스트로 존재 확인
    const { data, error } = await client.storage.listBuckets();
    if (error) return { ok: false, detail: error.message };
    const found = data.some((b) => b.name === EVIDENCE_BUCKET);
    return found
      ? { ok: true, detail: `bucket '${EVIDENCE_BUCKET}' exists` }
      : { ok: false, detail: `bucket '${EVIDENCE_BUCKET}' not found. Supabase Dashboard → Storage → New bucket` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message?.slice(0, 200) };
  }
}

function checkEmail(): CheckResult {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key) {
    return { ok: true, detail: "RESEND_API_KEY not set — using console fallback (dev mode)" };
  }
  if (!from) {
    return { ok: false, detail: "RESEND_API_KEY set but EMAIL_FROM missing" };
  }
  return { ok: true, detail: `configured, from=${from}` };
}
