import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseUser } from "@/lib/auth/session";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { LoginForm } from "./LoginForm";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

// 이미 로그인된 사용자가 /login 접근 시 /app 으로.
// next 는 반드시 sanitize (외부 리다이렉트 방지).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const user = await getSupabaseUser();
  const next = sanitizeNextPath(searchParams.next);
  if (user) redirect(next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      {/* 일러스트·법봉·법전 이미지 없음. 배경은 단순 neutral. */}
      <div className="w-full max-w-[400px]">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
        >
          <Icon name="chevron-right" size={14} className="rotate-180" />
          서비스 소개
        </Link>

        <p className="text-base font-semibold tracking-title text-fg">LawChange</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-title text-fg">
          다시 만나서 반갑습니다
        </h1>
        <p className="mt-2 text-base text-fg-secondary">
          업무에 필요한 법령 변경을 한 곳에서 관리하세요.
        </p>

        {searchParams.error && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-danger/25 bg-danger-subtle px-4 py-3 text-sm text-danger"
          >
            로그인에 실패했습니다. {searchParams.error}
          </div>
        )}

        <div className="mt-7">
          <LoginForm next={next} />
        </div>

      </div>
    </main>
  );
}
