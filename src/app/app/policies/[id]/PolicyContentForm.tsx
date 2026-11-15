"use client";

import { useState } from "react";
import { savePolicyContentAction } from "@/lib/policies/actions";
import { useAsyncAction } from "@/lib/useAsyncAction";

// 사규 본문을 붙여넣는 곳. 본문이 있어야 근거 법령을 뽑을 수 있다.
// 파일 업로드가 아니라 붙여넣기부터 두는 이유: 담당자가 한글·워드로 갖고
// 있는 사규를 그대로 복사해 넣는 것이 가장 빠르다. 형식 변환기를 먼저
// 만들면 그것이 막혀 아무도 시작하지 못한다.
export function PolicyContentForm({
  policyId,
  initialText,
  savedAt,
}: {
  policyId: string;
  initialText: string | null;
  savedAt: string | null;
}) {
  const [open, setOpen] = useState(!initialText);
  const [text, setText] = useState(initialText ?? "");
  const { pending, status, runWithRefresh } = useAsyncAction();
  const error = status.kind === "error" ? status.msg : null;

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm text-fg-secondary">
          본문 {initialText ? `${initialText.length.toLocaleString("ko-KR")}자` : "없음"}
          {savedAt ? ` · ${savedAt} 저장` : ""}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-primary-text underline underline-offset-2 hover:no-underline"
        >
          본문 수정
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="policy-content" className="text-sm font-medium text-fg">
        사규 본문
      </label>
      <p className="mt-1 text-sm text-fg-secondary">
        한글·워드 문서의 내용을 그대로 붙여넣으세요. 본문에 적힌 &ldquo;「근로기준법」
        제53조에 따라&rdquo; 같은 근거를 찾아 연결 후보로 보여드립니다.
      </p>
      <textarea
        id="policy-content"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        className="mt-2 w-full rounded-md border border-line bg-surface p-3 font-legal text-sm text-fg"
        placeholder="제1조(목적) 이 규정은 「근로기준법」 제53조에 따라 …"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            void runWithRefresh(
              () => savePolicyContentAction(policyId, text),
              () => setOpen(false),
            );
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-[rgb(var(--surface))] disabled:opacity-60"
        >
          {pending ? "저장 중…" : "저장하고 근거 찾기"}
        </button>
        {initialText ? (
          <button
            type="button"
            onClick={() => {
              setText(initialText);
              setOpen(false);
            }}
            className="text-sm text-fg-secondary hover:text-fg"
          >
            취소
          </button>
        ) : null}
        <span className="text-xs text-fg-muted tabular">
          {text.length.toLocaleString("ko-KR")}자
        </span>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
