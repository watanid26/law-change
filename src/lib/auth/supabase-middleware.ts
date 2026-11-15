// Middleware 용 Supabase 세션 갱신 헬퍼.
// Edge middleware 에서 요청/응답 쿠키를 통해 세션 refresh — 만료된 access token 자동 갱신.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function refreshSupabaseSession(req: NextRequest) {
  const response = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: "", ...options });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  // getUser() 는 Supabase Auth 로의 network round-trip — 느려질 경우
  // Vercel serverless function 예산을 잠식하고 후속 요청이 503 이 될 수 있다.
  // 라운드 7 QA: 삭제/해제 액션의 30초 프리징이 middleware 대기에서 발생한다는 정황 강함.
  // - 3초 timeout: Supabase 가 이 안에 응답 못 하면 미인증으로 취급하고 middleware 진행.
  //   진짜 세션이 있어도 이번 요청만 미인증 처리되고, 다음 요청에서 다시 확인된다.
  //   Best-effort auth — 안정성이 정확도보다 우선.
  const AUTH_TIMEOUT_MS = 3000;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auth-timeout")), AUTH_TIMEOUT_MS),
      ),
    ]);
    return { response, user: result.data.user };
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "auth-timeout") {
      console.warn(`[middleware auth] getUser timeout > ${AUTH_TIMEOUT_MS}ms — treating as unauthenticated`);
    } else {
      console.warn("[middleware auth] getUser failed", msg);
    }
    return { response, user: null };
  }
}
