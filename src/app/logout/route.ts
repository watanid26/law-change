// 서버 측 로그아웃 라우트.
// 브라우저 supabase.auth.signOut() 만으로는 middleware 가 읽는 httpOnly 쿠키가
// 남아 있어 다음 요청부터 세션이 유지되는 문제가 있었다 (QA 라운드 5 지적).
// 여기서는 서버 supabase 인스턴스로 signOut 해서 요청/응답 쿠키를 모두 정리한다.

import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/auth/supabase-server";

export const dynamic = "force-dynamic";

async function performLogout(req: NextRequest) {
  const supabase = getServerSupabase();
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("[logout] signOut threw (proceeding with redirect)", (err as Error).message);
  }
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest) {
  return performLogout(req);
}

// GET 도 허용해 <Link href="/logout"> 등 단순 이동으로도 작동하게 한다.
export async function GET(req: NextRequest) {
  return performLogout(req);
}
