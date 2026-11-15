"use client";

import { useTransition, useState } from "react";
import { updateMemberRoleAction, removeMemberAction } from "./actions";
// 라운드 22-Fix: labels.ts 로부터만 임포트 (service.ts 는 prisma 를 끌어들여 client bundle 오염).
import { ROLE_LABEL, STATUS_LABEL, type WorkspaceRole, type MemberStatus } from "@/lib/members/labels";
import { maskEmail } from "@/lib/pii";
import { useConfirm } from "@/components/ui/confirm";

interface Props {
  id: string;
  email: string | null;
  displayName: string | null;
  role: WorkspaceRole;
  status: MemberStatus;
  isCurrentUser: boolean;
  canManage: boolean;
}

export function MemberRow({ id, email, displayName, role, status, isCurrentUser, canManage }: Props) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const displayLabel = displayName ?? (email ? maskEmail(email) : "이름 미등록");

  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-fg">
          {displayLabel}
          {isCurrentUser && <span className="ml-2 text-xs text-fg-secondary">(나)</span>}
        </div>
        {email && displayName && (
          // 라운드 31: 화면 공유가 잦은 업무 환경. 알림 설정 화면과 같은 규칙으로
          // 마스킹하고, 전체 주소는 title 로만 확인 (정책 일원화).
          <div className="text-xs text-fg-secondary" title={email}>{maskEmail(email)}</div>
        )}
      </td>
      <td className="px-4 py-3">
        {canManage && !isCurrentUser && role !== "OWNER" ? (
          <select
            defaultValue={role}
            disabled={pending}
            onChange={(e) => {
              const newRole = e.target.value as WorkspaceRole;
              startTransition(async () => {
                setError(null);
                const result = await updateMemberRoleAction(id, newRole);
                if (!result.ok) setError(result.error);
              });
            }}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg transition-colors duration-swift focus:border-primary focus:outline-none select-field"
          >
            <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
            <option value="MEMBER">{ROLE_LABEL.MEMBER}</option>
            <option value="VIEWER">{ROLE_LABEL.VIEWER}</option>
          </select>
        ) : (
          <span className="text-xs text-fg">{ROLE_LABEL[role]}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={
            "inline-flex px-2 py-[3px] text-xs font-medium " +
            (status === "ACTIVE"
              ? "bg-change-addedPanel text-success border border-change-addedMark"
              : status === "INVITED"
                ? "bg-change-modifiedPanel text-warning border border-change-modifiedMark"
                : "bg-subtle text-fg-muted border border-line-strong")
          }
        >
          {STATUS_LABEL[status]}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {canManage && !isCurrentUser && role !== "OWNER" && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: `${displayLabel} 을(를) 제거할까요?`,
                body: "이 사람은 더 이상 워크스페이스에 접근할 수 없습니다.",
                confirmLabel: "제거",
                tone: "danger",
              });
              if (!ok) return;
              startTransition(async () => {
                setError(null);
                const result = await removeMemberAction(id);
                if (!result.ok) setError(result.error);
              });
            }}
            className="text-xs text-danger underline decoration-dotted underline-offset-2 hover:decoration-solid disabled:opacity-50"
          >
            제거
          </button>
        )}
      </td>
      {error && (
        <td colSpan={4} className="px-4 pb-2 text-xs text-danger">
          {error}
        </td>
      )}
    </tr>
  );
}
