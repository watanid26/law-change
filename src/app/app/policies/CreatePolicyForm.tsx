"use client";

import { useState } from "react";
import { createPolicyAction } from "@/lib/policies/actions";
import { POLICY_TYPE_LABEL, POLICY_TYPE_VALUES, type PolicyType } from "@/lib/policies/labels";
import { useAsyncAction } from "@/lib/useAsyncAction";

export function CreatePolicyForm() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PolicyType>("REGULATION");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const { pending, status, runWithRefresh } = useAsyncAction();
  const [validationError, setValidationError] = useState<string | null>(null);
  const error = status.kind === "error" ? status.msg : validationError;

  function submit() {
    if (!title.trim()) { setValidationError("제목을 입력해주세요."); return; }
    setValidationError(null);
    void runWithRefresh(
      () => createPolicyAction({
        type,
        title: title.trim(),
        externalUrl: url.trim() || undefined,
      }),
      () => {
        setOpen(false);
        setTitle("");
        setUrl("");
      },
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover"
      >
        ＋ 사규 추가
      </button>
    );
  }

  return (
    <div className="w-full max-w-md border border-line border-l-[3px] border-l-primary bg-surface p-4 space-y-3">
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PolicyType)}
          className="border border-line-strong bg-surface px-2 py-2 text-sm focus:border-primary focus:outline-none select-field"
        >
          {POLICY_TYPE_VALUES.map((v) => (
            <option key={v} value={v}>{POLICY_TYPE_LABEL[v]}</option>
          ))}
        </select>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 개인정보처리방침"
          className="flex-1 border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none "
          autoFocus
        />
      </div>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="외부 링크 (선택, 사내 문서 시스템 URL)"
        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted transition-colors duration-swift focus:border-primary focus:outline-none disabled:bg-subtle disabled:text-fg-disabled "
      />
      {error && <p role="alert" aria-live="assertive" className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setTitle(""); setUrl(""); }}
          disabled={pending}
          className="border border-line bg-surface px-3 py-1.5 text-sm text-fg hover:bg-hover"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !title.trim()}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:bg-subtle disabled:text-fg-disabled"
        >
          {pending ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
