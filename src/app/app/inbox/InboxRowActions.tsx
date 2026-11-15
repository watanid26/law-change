"use client";

// 목록에서 바로 담당자를 배정하고 상태를 바꾸는 자리.
//
// 협업 기능은 원래 다 있었다 — 담당 부서·담당자 지정, 검토 시작/기각,
// 업무 만들기까지. 문제는 그걸 쓰려면 매번 상세 페이지에 들어가야 했다는
// 것이다. 실사용 평가: "팀 단위로 하루에 여러 건을 훑어보며 담당자를
// 배분해야 하는 실무자 입장에서는 리스트에서 바로 누르는 것과, 건마다
// 상세에 들어가 스크롤해서 필드를 채우는 것은 체감 속도가 크게 다릅니다."
//
// 새 기능을 만들지 않았다. 이미 있는 서버 액션(assessInboxAction /
// transitionInboxAction)을 목록에서 부를 뿐이다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { assessInboxAction, transitionInboxAction } from "@/lib/inbox/actions";
import { useAsyncAction } from "@/lib/useAsyncAction";
import {
  INBOX_STATUS_LABEL,
  INBOX_TRANSITIONS,
  type InboxStatus,
} from "@/lib/inbox/labels";
import { fieldClass, cx } from "@/components/ui";

interface Props {
  inboxId: string;
  status: InboxStatus;
  assignedMemberId: string | null;
  members: { id: string; label: string }[];
}

export function InboxRowActions({ inboxId, status, assignedMemberId, members }: Props) {
  const router = useRouter();
  const { pending, status: result, run } = useAsyncAction();
  // 서버가 확정하기 전에도 고른 값이 그대로 보이게 한다.
  const [assignee, setAssignee] = useState(assignedMemberId ?? "");

  // 저장이 실패했는데 화면에만 새 담당자가 남아 있으면 배정된 줄 안다.
  // 서버가 준 값으로 되돌린다.
  useEffect(() => {
    if (result.kind === "error") setAssignee(assignedMemberId ?? "");
  }, [result, assignedMemberId]);
  const next = INBOX_TRANSITIONS[status] ?? [];
  const error = result.kind === "error" ? result.msg : null;

  function assign(memberId: string) {
    setAssignee(memberId);
    void run(
      () => assessInboxAction(inboxId, { assignedToMemberId: memberId || null }),
      () => router.refresh(),
    );
  }

  function transition(to: string) {
    if (!to) return;
    void run(
      () => transitionInboxAction(inboxId, { status: to }),
      () => router.refresh(),
    );
  }

  const select = cx(
    fieldClass({ className: "select-field h-8 w-auto py-0 text-sm" }),
    pending && "opacity-60",
  );

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <div className="flex items-center gap-1.5">
        <select
          aria-label="담당자 배정"
          className={select}
          value={assignee}
          disabled={pending}
          onChange={(e) => assign(e.target.value)}
        >
          <option value="">담당자 미지정</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        {next.length > 0 ? (
          <select
            aria-label="상태 변경"
            className={select}
            value=""
            disabled={pending}
            onChange={(e) => transition(e.target.value)}
          >
            {/* 갈 수 없는 상태는 아예 안 보여준다. 누른 뒤에 거절당하면
                "왜 안 되지" 를 화면 밖에서 알아내야 한다. */}
            <option value="">상태 변경…</option>
            {next.map((s) => (
              <option key={s} value={s}>
                {INBOX_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger sm:text-right">
          {error}
        </p>
      ) : null}
    </div>
  );
}
