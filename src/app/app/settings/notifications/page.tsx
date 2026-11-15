import { requireUserContext } from "@/lib/auth/session";
import { getOrCreatePreference } from "@/lib/preferences/notification";
import { NotificationPreferenceForm } from "./NotificationPreferenceForm";
import { maskEmail } from "@/lib/pii";
import { emailProviderInUse } from "@/lib/notifications/email-transport";
import { Breadcrumb, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const ctx = await requireUserContext();
  const pref = await getOrCreatePreference(ctx.memberId);
  // 발송 설정이 안 돼 있으면 알림이 조용히 사라진다. 화면에서 바로 알 수 있게 한다.
  const provider = emailProviderInUse();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[{ label: "설정", href: "/app/settings" }, { label: "알림" }]}
          />
        }
        title="알림"
        description={
          <>
            <span
              title={ctx.email ?? undefined}
              className="cursor-help underline decoration-dotted decoration-fg-muted underline-offset-4"
            >
              {maskEmail(ctx.email)}
            </span>
            {" "}로 발송되는 알림을 관리합니다.
          </>
        }
      />

      {provider === "console" ? (
        <div
          role="alert"
          className="mb-6 rounded-md border border-warning/25 bg-warning-subtle px-4 py-3 text-sm text-warning"
        >
          {/* "환경변수를 넣어 주세요" 만으로는 무엇부터 해야 하는지 모른다.
              SMTP 는 도메인 인증 없이 기존 메일 계정으로 바로 되는 경로라
              그것을 먼저 안내한다. 그리고 이제 이 상태에서 생긴 알림은
              버려지지 않고 보류되므로, 그 사실도 알려준다. */}
          <span className="font-medium">이메일 발송이 아직 설정되지 않았습니다.</span>{" "}
          지금 켜 둔 알림은 <span className="font-medium">사라지지 않고 대기</span>하다가,
          발송 설정이 되면 밀린 것부터 나갑니다.
          <span className="mt-1.5 block text-warning/85">
            서버 환경변수에 <code className="font-mono">SMTP_HOST</code> ·{" "}
            <code className="font-mono">SMTP_USER</code> ·{" "}
            <code className="font-mono">SMTP_PASS</code> ·{" "}
            <code className="font-mono">EMAIL_FROM</code> 을 넣으면 됩니다. 회사
            메일이나 Gmail 계정을 그대로 쓸 수 있고 도메인 인증은 필요 없습니다.
            (대량 발송으로 넘어갈 때 <code className="font-mono">RESEND_API_KEY</code> 로 교체)
          </span>
        </div>
      ) : null}

      <NotificationPreferenceForm
        initial={{
          changeInApp: pref.changeInApp,
          changeEmail: pref.changeEmail,
          reminderInApp: pref.reminderInApp,
          reminderEmail: pref.reminderEmail,
          digestMode: pref.digestMode as "IMMEDIATE" | "DAILY" | "WEEKLY" | "OFF",
        }}
      />

      <p className="mt-6 text-xs text-fg-muted">
        관심 법령마다 이메일 알림 여부를 개별로 설정할 수도 있습니다.
        여기 설정은 계정 전체 기본값이고, 관심 법령 개별 설정이 있으면 그쪽이 우선합니다.
      </p>
    </div>
  );
}

