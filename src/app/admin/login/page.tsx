import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_MS,
  issueAdminSessionToken,
  verifyAdminPassword,
} from "@/lib/security/auth";

interface Props {
  searchParams: { next?: string; error?: string };
}

async function login(formData: FormData): Promise<void> {
  "use server";
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin/collector");

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    redirect(`/admin/login?error=no_secret&next=${encodeURIComponent(next)}`);
  }
  if (!verifyAdminPassword(password)) {
    redirect(`/admin/login?error=invalid&next=${encodeURIComponent(next)}`);
  }
  const token = issueAdminSessionToken(secret!);
  cookies().set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });
  redirect(next.startsWith("/admin") ? next : "/admin/collector");
}

export default function AdminLoginPage({ searchParams }: Props) {
  const error = searchParams.error;
  const next = searchParams.next ?? "/admin/collector";

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm border border-line bg-surface p-8">
        <div className="mb-1 text-xs text-fg-muted">ADMIN</div>
        <h1 className="text-3xl font-medium tracking-title text-fg">관리자 로그인</h1>
        <p className="mt-2 text-xs text-fg-secondary">ADMIN_SECRET 환경변수 값을 입력하세요.</p>

        {error === "invalid" ? (
          <p className="mt-4 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-xs text-danger">
            비밀번호가 올바르지 않습니다.
          </p>
        ) : null}
        {error === "no_secret" ? (
          <p className="mt-4 border-l-[3px] border-change-modifiedMark bg-change-modifiedPanel px-3 py-2 text-xs text-warning">
            서버에 ADMIN_SECRET이 설정되어 있지 않습니다.
          </p>
        ) : null}

        <form action={login} className="mt-5 space-y-3">
          <input type="hidden" name="next" value={next} />
          <input
            type="password"
            name="password"
            required
            autoComplete="off"
            placeholder="ADMIN_SECRET"
            className="w-full h-11 border border-line-strong bg-surface px-3 text-sm text-fg focus:border-primary focus:outline-none "
          />
          <button
            type="submit"
            className="w-full h-11 bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            로그인
          </button>
        </form>

        <p className="mt-5 text-xs text-fg-muted">
          이 화면은 임시 관리자 인증입니다. 다음 라운드에 Supabase Auth의 admin role로 교체됩니다.
        </p>
      </div>
    </div>
  );
}
