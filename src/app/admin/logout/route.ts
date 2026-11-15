import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/security/auth";

export async function GET() {
  const res = NextResponse.redirect(new URL("/admin/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3111"));
  res.cookies.set(ADMIN_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
