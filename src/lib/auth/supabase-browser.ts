// Browser 용 Supabase 클라이언트 — Client Component / hooks 에서 사용.
// 세션 쿠키는 @supabase/ssr 가 자동으로 관리.

import { createBrowserClient } from "@supabase/ssr";

export function getBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
