// 설정 허브.
//
// 제2판은 bordered option grid(2칸 카드)였다. 항목이 둘뿐인데 카드로 감싸니
// 화면이 비어 보이면서도 무거웠다. 제3판은 heading + description + control
// 형태의 리스트로 바꾸고, 카드로 감싸지 않는다.

import Link from "next/link";
import { requireUserContext } from "@/lib/auth/session";
import { listMembers } from "@/lib/members/service";
import { Icon } from "@/components/Icon";
import { PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsHubPage() {
  const ctx = await requireUserContext();
  const members = await listMembers(ctx.workspaceId, ctx.memberId);

  const sections = [
    {
      href: "/app/settings/team",
      title: "팀 구성원",
      desc: `${members.length}명이 이 워크스페이스에 참여하고 있습니다. 초대와 역할을 관리합니다.`,
      icon: "users" as const,
    },
    {
      href: "/app/settings/notifications",
      title: "알림",
      desc: "관심 법령이 개정되면 이메일로 알려드립니다. 수신 조건을 정합니다.",
      icon: "bell" as const,
    },
    // 사규는 사이드바 최상위에서 내렸다 (법령↔사규 매핑 0건).
    // 기능은 살아 있으므로 여기서 접근 경로를 유지한다.
    {
      href: "/app/policies",
      title: "내부 사규",
      desc: "조직 내부 규정과 법령의 연결 관계를 관리합니다.",
      icon: "file-text" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="설정"
        description={`${ctx.workspaceName} · ${
          ctx.workspaceType === "PERSONAL" ? "개인 워크스페이스" : "팀 워크스페이스"
        }`}
      />

      <Panel className="divide-y divide-line overflow-hidden">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-4 px-4 py-4 transition-colors duration-swift hover:bg-hover sm:px-5"
          >
            <Icon name={s.icon} size={18} className="shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium text-fg">{s.title}</span>
              <span className="mt-0.5 block text-sm text-fg-secondary">{s.desc}</span>
            </span>
            <Icon
              name="chevron-right"
              size={16}
              className="shrink-0 text-fg-disabled"
            />
          </Link>
        ))}
      </Panel>

      {/* 사용자가 알아야 할 제약사항인데 fg-muted 소형 텍스트라 놓치기 쉬웠다
           (사용성 평가). 아이콘 + 본문 대비로 올린다. */}
      <div className="mt-5 flex items-start gap-2.5 rounded-md border border-line bg-subtle px-4 py-3">
        <Icon name="bell" size={16} className="mt-0.5 shrink-0 text-fg-secondary" />
        <p className="text-sm text-fg-secondary">
          <span className="font-medium text-fg">감사 로그</span>는
          아직 지원하지 않습니다. 목록 데이터 내보내기는 변경 알림·관심 법령·업무
          화면에서 바로 받을 수 있습니다.
        </p>
      </div>
    </div>
  );
}
