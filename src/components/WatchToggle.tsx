"use client";

// 관심 등록/해제 컨트롤. 라운드 7 QA 결과 Server Action 은 HTTP 5xx 를 응답 body 의
// {ok:true} 로 덮어써 client 가 성공으로 오인하는 문제와, auto-refresh 로 함수 예산을
// 잠식해 30초 프리징을 유발하는 문제가 있음. → API route + fetch 로 전환.
// HTTP status 가 truth 이고 auto-refresh 없음.
//
// 라운드 8: optimistic 후 실패 시 UI 를 원복하도록 useRef 기반 snapshot + effect 감시.

import Link from "next/link";
import { Icon } from "./Icon";
import { useEffect, useRef, useState } from "react";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { useConfirm } from "@/components/ui/confirm";

interface Props {
  documentId: string;
  initialWatch: { id: string; status: string } | null;
}

export function WatchToggle({ documentId, initialWatch }: Props) {
  const confirm = useConfirm();
  const [watch, setWatch] = useState(initialWatch);
  const { pending, status, runFetch } = useAsyncAction();
  // Optimistic snapshot: 낙관적으로 반영한 값이 실패하면 원복하기 위한 참조.
  const optimisticSnapshot = useRef<typeof watch | null>(null);

  // status 가 error 로 바뀌면 optimistic 반영 원복.
  useEffect(() => {
    if (status.kind === "error" && optimisticSnapshot.current !== null) {
      setWatch(optimisticSnapshot.current);
      optimisticSnapshot.current = null;
    } else if (status.kind === "ok") {
      // 성공 확정 — snapshot 폐기
      optimisticSnapshot.current = null;
    }
  }, [status]);

  // 등록 직후에 고른 적용 여부. null 이면 아직 안 골랐다는 뜻.
  const [applicability, setApplicabilityState] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  function setApplicability(value: string) {
    if (!watch) return;
    const before = applicability;
    setApplicabilityState(value);
    setApplyError(null);
    // 등록과 같은 이유로 server action 대신 API route 를 쓴다 —
    // HTTP status 가 truth 다 (파일 상단 주석 참고).
    void fetch(`/api/watches/${watch.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicabilityStatus: value }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
      })
      .catch(() => {
        // 저장이 안 됐는데 "표시했습니다" 가 남으면 표시된 줄 안다.
        setApplicabilityState(before);
        setApplyError("저장하지 못했습니다. 관심 법령 화면에서 다시 골라 주세요.");
      });
  }

  const isActive = watch?.status === "ACTIVE";
  const error = status.kind === "error" ? status.msg : null;
  // 방금 이 화면에서 등록했는지. 처음부터 등록돼 있던 경우와 구분해야
  // "등록됐다"는 안내를 엉뚱한 때 띄우지 않는다.
  const justRegistered =
    status.kind === "ok" && isActive && initialWatch?.status !== "ACTIVE";

  function register() {
    optimisticSnapshot.current = watch;
    void runFetch<{ watchId: string; status: string }>(
      {
        url: "/api/watches/register",
        method: "POST",
        body: JSON.stringify({ documentId }),
      },
      (data) => {
        if (data?.watchId) {
          setWatch({ id: data.watchId, status: data.status ?? "ACTIVE" });
          optimisticSnapshot.current = null;
        }
      },
    );
  }

  async function archive() {
    if (!watch) return;
    const ok = await confirm({
      title: "관심 법령에서 제외할까요?",
      body: "개정 알림을 더 이상 받지 않습니다. 지금까지의 기록은 남고, 다시 등록하면 이어집니다.",
      confirmLabel: "제외",
      tone: "danger",
    });
    if (!ok) return;
    optimisticSnapshot.current = watch;
    setWatch({ id: watch.id, status: "ARCHIVED" });
    void runFetch({ url: `/api/watches/${watch.id}/archive`, method: "POST" });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {/* 등록 직후가 적용 여부를 묻기 가장 좋은 자리다. 지금 이 법령을
          왜 담았는지가 머릿속에 있는 순간이기 때문이다.
          이걸 안 물어서 실제로 적용 판단이 0/21 이었다 — 화면은 관심 법령
          상세에 있는데 아무도 거기까지 가서 고르지 않는다.
          이 값이 없으면 "우리 회사에 어떤 영향인가" 를 영영 말할 수 없다. */}
      {justRegistered ? (
        <div
          role="status"
          className="w-full max-w-xs rounded-md border border-line bg-surface p-3 text-left"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <Icon name="check" size={14} />
            등록했습니다 · 개정되면 이메일로 알려드립니다
          </p>
          {applicability === null ? (
            <>
              <p className="mt-2 text-sm text-fg">이 법령이 우리 회사에 적용되나요?</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                지금 답해 두면 개정 알림에서 우리와 무관한 건을 걸러냅니다.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ApplyButton onClick={() => setApplicability("APPLICABLE")} label="적용됩니다" primary />
                <ApplyButton onClick={() => setApplicability("NEEDS_REVIEW")} label="더 봐야 함" />
                <ApplyButton onClick={() => setApplicability("NOT_APPLICABLE")} label="해당 없음" />
              </div>
            </>
          ) : (
            <p className="mt-1.5 text-xs text-fg-muted">
              {applicability === "APPLICABLE"
                ? "적용됨으로 표시했습니다."
                : applicability === "NOT_APPLICABLE"
                  ? "해당 없음으로 표시했습니다. 알림은 계속 받되 목록에서 걸러집니다."
                  : "추가 검토로 표시했습니다."}
            </p>
          )}
          {applyError ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {applyError}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="inline-flex items-center gap-2">
      {!isActive ? (
        <button
          type="button"
          onClick={register}
          disabled={pending}
          className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:opacity-50"
        >
          <Icon name="plus" size={15} />
          {pending ? "등록 중…" : "관심 법령 등록"}
        </button>
      ) : (
        <>
          <span
            className="inline-flex items-center gap-1.5 whitespace-nowrap border border-change-addedMark bg-change-addedPanel px-2.5 py-1 text-xs font-semibold text-success"
            aria-label="관리 중"
          >
            <span aria-hidden="true">✓</span> 관리 중
          </span>
          <Link
            href={`/app/watches/${watch!.id}`}
            className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-swift hover:bg-hover"
          >
            조문·담당자 설정
          </Link>
          <button
            type="button"
            onClick={archive}
            disabled={pending}
            className="whitespace-nowrap border border-line bg-surface px-2.5 py-1 text-xs text-fg-secondary hover:bg-hover disabled:opacity-50"
          >
            {pending ? "해제 중..." : "관심 해제"}
          </button>
        </>
      )}
      </div>
      {error && (
        <span role="alert" aria-live="assertive" className="ml-2 text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

// 조합해서 이런 진짜 실패에도 원복하는 게 이상적이지만 단순화 우선.
// TODO: status.kind === "error" 감지해 setWatch(snapshot) 으로 롤백하는 effect.

/** 등록 직후 적용 여부를 고르는 작은 버튼. */
function ApplyButton({
  onClick,
  label,
  primary,
}: {
  onClick: () => void;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover"
          : "inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-sm text-fg transition-colors duration-swift hover:bg-hover"
      }
    >
      {label}
    </button>
  );
}
