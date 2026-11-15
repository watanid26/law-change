"use client";

// 라운드 28-D: 산업 프리셋 하위 법령 목록 + 체크박스 + "한 번에 관심 등록" 버튼.
// 로그인 상태에서만 등록 가능. 미로그인 시 로그인 유도.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkWatchAction } from "./actions";

interface Item {
  documentId: string | null; // null 이면 프리셋 이름은 있으나 아직 DB 에 없음
  sourceId: string | null;
  title: string;
  presetTitle: string; // 프리셋에 정의된 원래 이름 (표시용)
  documentType: string | null;
  agencyName: string | null;
  matched: boolean; // DB 매칭 성공 여부
  alreadyWatched: boolean;
}

interface Props {
  items: Item[];
  isAuthed: boolean;
  loginHref: string;
}

export function BulkWatchList({ items, isAuthed, loginHref }: Props) {
  const router = useRouter();
  const registerableIds = items
    .filter((it) => it.matched && !it.alreadyWatched && it.documentId)
    .map((it) => it.documentId as string);

  const [selected, setSelected] = useState<Set<string>>(new Set(registerableIds));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{
    kind: "ok" | "error";
    text: string;
    /** 실제로 새로 등록된 건수. 0이면 "이미 다 등록돼 있음" 이라 안내를 달리한다. */
    registered?: number;
  } | null>(null);

  function toggle(documentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === registerableIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(registerableIds));
    }
  }

  function submit() {
    if (selected.size === 0) {
      setMsg({ kind: "error", text: "선택된 법령이 없습니다." });
      return;
    }
    startTransition(async () => {
      const result = await bulkWatchAction(Array.from(selected));
      if (result.ok) {
        const parts: string[] = [];
        if (result.created > 0) parts.push(`신규 ${result.created}건`);
        if (result.reactivated > 0) parts.push(`재활성 ${result.reactivated}건`);
        if (result.alreadyActive > 0) parts.push(`이미 등록 ${result.alreadyActive}건`);
        if (result.failed > 0) parts.push(`실패 ${result.failed}건`);
        const done = result.created + result.reactivated;
        setMsg({
          kind: "ok",
          text: parts.length ? parts.join(" · ") : "처리 완료",
          registered: done,
        });
        setSelected(new Set());
        router.refresh();
      } else {
        setMsg({ kind: "error", text: result.error });
      }
    });
  }

  const canRegister = isAuthed && registerableIds.length > 0;
  const allSelected = registerableIds.length > 0 && selected.size === registerableIds.length;

  return (
    <div>
      {/* 상단 컨트롤 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3 text-xs text-fg-secondary">
          <button
            type="button"
            onClick={toggleAll}
            disabled={!canRegister}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-swift hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {allSelected ? "전체 해제" : "전체 선택"} ({registerableIds.length}건 등록 가능)
          </button>
          <span>{selected.size}건 선택됨</span>
        </div>
        {isAuthed ? (
          <button
            type="button"
            onClick={submit}
            disabled={pending || selected.size === 0}
            className="h-10 box-border inline-flex items-center justify-center border border-primary bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-swift ease-swift"
          >
            {pending ? "등록 중…" : `선택 ${selected.size}건 관심 등록`}
          </button>
        ) : (
          <Link
            href={loginHref}
            className="h-10 box-border inline-flex items-center justify-center border border-primary bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary-hover transition-colors"
          >
            로그인하고 관심 등록
          </Link>
        )}
      </div>

      {msg && (
        <div
          role={msg.kind === "error" ? "alert" : "status"}
          className={
            msg.kind === "ok"
              ? "mb-4 rounded-md border border-success/25 bg-success-subtle px-4 py-3"
              : "mb-4 rounded-md border border-danger/25 bg-danger-subtle px-4 py-3 text-sm text-danger"
          }
        >
          {msg.kind === "ok" ? (
            <>
              <p className="text-base font-medium text-success">
                {msg.registered && msg.registered > 0
                  ? `${msg.registered}건을 관심 법령으로 등록했습니다`
                  : "처리했습니다"}
              </p>
              <p className="mt-1 text-sm text-fg-secondary">
                {msg.text}
                {msg.registered && msg.registered > 0
                  ? " · 이 법령이 개정되면 이메일로 알려드립니다."
                  : ""}
              </p>
              {msg.registered && msg.registered > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/app/watches"
                    className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-swift hover:bg-hover"
                  >
                    관심 법령 보기
                  </Link>
                  <Link
                    href="/app/settings/notifications"
                    className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-fg-secondary transition-colors duration-swift hover:bg-hover hover:text-fg"
                  >
                    알림 설정 확인
                  </Link>
                </div>
              ) : null}
            </>
          ) : (
            msg.text
          )}
        </div>
      )}

      {/* 법령 목록 */}
      <ul className="border border-line bg-surface divide-y divide-line">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-1 px-4 py-3">
            {it.matched && it.documentId && !it.alreadyWatched ? (
              // 390px 실측에서 이 체크박스가 13×13px 이었다. 손가락으로 누르기엔
              // 너무 작다(권장 44×44). 상자 크기는 그대로 두고 누를 수 있는
              // 영역을 label 로 넓힌다 — 상자만 키우면 목록이 뭉툭해진다.
              <label className="-my-1 -ml-1 flex h-11 w-11 flex-shrink-0 cursor-pointer items-start justify-center pt-3">
                <input
                  type="checkbox"
                  checked={selected.has(it.documentId)}
                  onChange={() => toggle(it.documentId as string)}
                  disabled={!isAuthed || pending}
                  aria-label={`${it.title} 선택`}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            ) : (
              <span className="h-11 w-11 flex-shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              {it.matched && it.sourceId ? (
                <Link href={`/laws/${it.sourceId}`} className="text-base font-semibold text-fg hover:underline">
                  {it.title}
                </Link>
              ) : (
                <span className="text-base font-semibold text-fg-secondary">{it.presetTitle}</span>
              )}
              <div className="mt-0.5 text-xs text-fg-secondary">
                {it.matched ? (
                  <>
                    {it.documentType ?? "—"}
                    {it.agencyName ? ` · 소관 ${it.agencyName}` : ""}
                  </>
                ) : (
                  <span className="text-fg-muted">현재 DB 에 등록되지 않은 법령 (동명 이본이 있을 수 있음)</span>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 text-xs">
              {!it.matched ? (
                <span className="border border-line bg-subtle px-2 py-1 text-fg-muted">미수집</span>
              ) : it.alreadyWatched ? (
                <span className="border border-change-addedMark bg-change-addedPanel px-2 py-1 font-semibold text-success">
                  이미 등록됨
                </span>
              ) : (
                <span className="border border-line bg-canvas px-2 py-1 text-fg-secondary">
                  등록 대기
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
