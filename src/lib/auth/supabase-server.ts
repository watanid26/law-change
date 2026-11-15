// Server 용 Supabase 클라이언트 — Server Component / Route Handler / Server Action.
// Next.js 14 App Router 의 cookies() 를 통해 세션 쿠키를 read/write.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Component 안에서 호출 (cookies() 는 read-only 컨텍스트에서도 안전하게 동작).
// set/remove 는 no-op 로 감싸서 Server Component 렌더 시 에러 방지.
export function getServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component 안에서 호출된 경우 무시 — middleware 가 세션 refresh 담당
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch { /* no-op */ }
        },
      },
    },
  );
}
