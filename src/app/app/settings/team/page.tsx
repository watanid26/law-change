// 라운드 19-C2: 팀 관리 페이지.
// 심사 지적: /app/settings, /app/team 404. 담당자 드롭다운은 로그인 계정 1명뿐.
// MVP 스코프: 구성원 리스트 + 초대(email) + 역할 변경 + 제거.

import { requireUserContext } from "@/lib/auth/session";
import { listMembers } from "@/lib/members/service";
import { InviteMemberForm } from "./InviteMemberForm";
import { MemberRow } from "./MemberRow";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ctx = await requireUserContext();
  const members = await listMembers(ctx.workspaceId, ctx.memberId);

  const currentMember = members.find((m) => m.isCurrentUser);
  const canManage = currentMember?.role === "OWNER" || currentMember?.role === "ADMIN";
  const isOwner = currentMember?.role === "OWNER";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="border-b border-line pb-5">
        <h1 className="text-3xl font-semibold text-fg">팀 구성원</h1>
        <p className="mt-2 text-sm text-fg-secondary">
          {ctx.workspaceName} · {members.length}명
        </p>
        <p className="mt-1 text-xs text-fg-secondary">
          {ctx.workspaceType === "PERSONAL"
            ? "개인 워크스페이스입니다. 구성원 초대는 팀 워크스페이스로 전환 후 가능합니다."
            : "구성원을 초대하고 역할·권한을 관리하세요."}
        </p>
      </div>

      {canManage && ctx.workspaceType !== "PERSONAL" && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-fg">새 구성원 초대</h2>
          <InviteMemberForm />
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-fg">구성원 목록</h2>
        <div className="border border-line bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-xs text-fg-secondary">
              <tr>
                <th className="px-4 py-3 text-left font-normal">이름 · 이메일</th>
                <th className="px-4 py-3 text-left font-normal">역할</th>
                <th className="px-4 py-3 text-left font-normal">상태</th>
                <th className="px-4 py-3 text-right font-normal">액션</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  id={m.id}
                  email={m.email}
                  displayName={m.displayName}
                  role={m.role}
                  status={m.status}
                  isCurrentUser={m.isCurrentUser}
                  canManage={isOwner}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-6 text-xs text-fg-secondary">
        역할 안내: 소유자(모든 권한, 워크스페이스 삭제) · 관리자(구성원·법령·업무 관리) ·
        구성원(업무 수행·법령 조회) · 뷰어(읽기 전용).
      </p>
    </div>
  );
}
