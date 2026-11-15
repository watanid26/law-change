// Supabase Storage 서버 사이드 클라이언트.
// - Service role key 사용 (서버에서만!). 절대 브라우저에 노출 금지.
// - 사용자에게 upload/download signed URL 을 발급 → 브라우저가 직접 스토리지에 업로드.
//
// 스토리지 구조:
//   버킷: EVIDENCE_BUCKET (기본 "evidence")
//   경로: {workspaceId}/{taskId}/{yyyymmdd}-{uuid}-{safeFilename}
//
// 사용자 액션 필요 (Supabase 대시보드):
//   1. Storage → New bucket → 이름 "evidence" (private)
//   2. RLS 정책은 이 앱이 service role 로 접근하므로 기본 정책 유지

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const EVIDENCE_BUCKET = process.env.SUPABASE_EVIDENCE_BUCKET ?? "evidence";

let cachedAdmin: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase storage not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  cachedAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

// 업로드 signed URL 생성 (5분 유효). 클라이언트가 이 URL 로 PUT 하여 스토리지에 저장.
export async function createUploadSignedUrl(params: {
  workspaceId: string;
  taskId: string;
  filename: string;
}): Promise<{ path: string; token: string; signedUrl: string }> {
  const admin = getAdmin();
  const path = buildObjectPath(params);
  const { data, error } = await admin.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "signed upload url failed");
  return { path, token: data.token, signedUrl: data.signedUrl };
}

// 다운로드 signed URL (60초). Evidence 상세에서 링크 클릭 시 발급.
export async function createDownloadSignedUrl(path: string): Promise<string> {
  const admin = getAdmin();
  const { data, error } = await admin.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, 60);
  if (error || !data) throw new Error(error?.message ?? "signed download url failed");
  return data.signedUrl;
}

// 파일 삭제 (soft-delete evidence 시엔 스토리지는 유지, hard 삭제 정책 오는 경우 사용).
export async function removeObject(path: string): Promise<void> {
  const admin = getAdmin();
  await admin.storage.from(EVIDENCE_BUCKET).remove([path]);
}

function buildObjectPath(params: { workspaceId: string; taskId: string; filename: string }): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 10);
  const safe = params.filename
    .replace(/[\/\\]/g, "_")
    .replace(/[^\w.\-가-힣]/g, "_")
    .slice(0, 100);
  return `${params.workspaceId}/${params.taskId}/${ymd}-${rand}-${safe}`;
}
