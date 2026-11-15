"use client";

// Task 증빙 목록 + 추가/삭제/다운로드.
// 파일 업로드: 브라우저가 Supabase 스토리지에 signed URL 로 직접 PUT.
// 서버는 signed URL 발급과 evidence 메타 저장만 담당.

import { useEffect, useRef, useState } from "react";
import { addEvidenceAction } from "@/lib/tasks/actions";
import { EVIDENCE_TYPE_LABEL, EVIDENCE_TYPE_VALUES, type EvidenceType } from "@/lib/tasks/labels";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { formatKoreanDate } from "@/lib/format";
import { useConfirm } from "@/components/ui/confirm";

interface EvidenceView {
  id: string;
  type: string;
  externalUrl: string | null;
  fileReference: string | null;
  description: string | null;
  createdAt: string;
  uploaderName: string | null;
}

interface Props {
  taskId: string;
  evidences: EvidenceView[];
}

export function EvidencePanel({ taskId, evidences: initialEvidences }: Props) {
  const confirm = useConfirm();
  // 라운드 6 QA: 삭제 시 router.refresh() 가 30초 프리징을 유발. 로컬 상태로 즉시 반영.
  // 서버 액션 성공 시 optimistic remove/add, 실패 시 revert.
  const [evidences, setEvidences] = useState<EvidenceView[]>(initialEvidences);
  const { pending, status, run, reset, runFetch } = useAsyncAction();
  const evidencesSnapshot = useRef<EvidenceView[] | null>(null);

  useEffect(() => {
    if (status.kind === "error" && evidencesSnapshot.current !== null) {
      setEvidences(evidencesSnapshot.current);
      evidencesSnapshot.current = null;
    } else if (status.kind === "ok") {
      evidencesSnapshot.current = null;
    }
  }, [status]);
  const [localError, setLocalError] = useState<string | null>(null);
  const error = localError ?? (status.kind === "error" ? status.msg : null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<{
    type: EvidenceType;
    externalUrl: string;
    fileReference: string;
    description: string;
  }>({ type: "LINK", externalUrl: "", fileReference: "", description: "" });

  function submit() {
    setLocalError(null);
    void run(
      () => addEvidenceAction(taskId, {
        type: form.type,
        externalUrl: form.externalUrl.trim() || null,
        fileReference: form.fileReference.trim() || null,
        description: form.description.trim() || null,
      }),
      (data) => {
        // 로컬 목록에 새 증빙을 즉시 추가.
        const newId = (data as { evidenceId?: string } | undefined)?.evidenceId ?? `tmp-${Date.now()}`;
        setEvidences((prev) => [
          {
            id: newId,
            type: form.type,
            externalUrl: form.externalUrl.trim() || null,
            fileReference: form.fileReference.trim() || null,
            description: form.description.trim() || null,
            createdAt: new Date().toISOString(),
            uploaderName: null,
          },
          ...prev,
        ]);
        setForm({ type: "LINK", externalUrl: "", fileReference: "", description: "" });
      },
    );
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setLocalError("파일 크기는 20MB 이하만 가능합니다.");
      return;
    }
    setLocalError(null);
    reset();
    setUploading(true);
    try {
      const signResp = await fetch("/api/storage/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, filename: file.name }),
      });
      const signJson = await signResp.json();
      if (!signResp.ok || !signJson.ok) {
        setLocalError(signJson.error ?? "업로드 URL 발급 실패");
        return;
      }
      const putResp = await fetch(signJson.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putResp.ok) {
        setLocalError("파일 업로드 실패 (스토리지)");
        return;
      }
      setForm((prev) => ({
        ...prev,
        type: prev.type === "LINK" ? "FILE" : prev.type,
        fileReference: signJson.path,
        description: prev.description || file.name,
      }));
    } catch {
      setLocalError("파일 업로드가 서버에 도달하지 못했습니다.");
    } finally {
      setUploading(false);
      // input reset (같은 파일 재선택 대응)
      e.target.value = "";
    }
  }

  async function openFile(evidenceId: string) {
    try {
      const resp = await fetch(`/api/storage/download-url?evidenceId=${encodeURIComponent(evidenceId)}`);
      const json = await resp.json();
      if (!resp.ok || !json.ok) {
        alert(json.error ?? "파일을 열 수 없습니다.");
        return;
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      alert("파일을 열 수 없습니다.");
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "이 증빙을 삭제할까요?",
      body: "화면에서는 사라지지만 감사 이력에는 삭제 기록이 남습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setLocalError(null);
    // Optimistic 삭제. 실패(server error / timeout) 시 useEffect 가 snapshot 복원.
    evidencesSnapshot.current = evidences;
    setEvidences((prev) => prev.filter((e) => e.id !== id));
    void runFetch({
      url: `/api/evidences/${id}`,
      method: "DELETE",
    });
  }

  return (
    <div className="mt-6 rounded-md rounded-md border border-line bg-surface p-5">
      <h2 className="text-base font-medium tracking-subtitle text-fg">증빙 <span className="text-xs text-fg-muted">({evidences.length})</span></h2>

      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as EvidenceType })}
            className="border border-line-strong bg-surface px-2 py-1.5 text-sm focus:border-primary focus:outline-none select-field"
          >
            {EVIDENCE_TYPE_VALUES.map((v) => (
              <option key={v} value={v}>{EVIDENCE_TYPE_LABEL[v]}</option>
            ))}
          </select>
        </div>
        <input
          type="url"
          value={form.externalUrl}
          onChange={(e) => setForm({ ...form, externalUrl: e.target.value })}
          placeholder="링크 URL (선택)"
          className="block w-full border border-line-strong bg-surface px-3 py-1.5 text-sm focus:border-primary focus:outline-none "
        />
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={form.fileReference}
            onChange={(e) => setForm({ ...form, fileReference: e.target.value })}
            placeholder="파일 경로 (업로드하면 자동)"
            readOnly={!!form.fileReference}
            className="flex-1 border border-line-strong bg-surface px-3 py-1.5 text-sm read-only:bg-subtle focus:border-primary focus:outline-none "
          />
          <label className="cursor-pointer whitespace-nowrap inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-swift hover:bg-hover">
            {uploading ? "업로드 중..." : "파일 선택"}
            <input
              type="file"
              className="sr-only"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
          {form.fileReference && (
            <button
              type="button"
              onClick={() => setForm({ ...form, fileReference: "" })}
              className="text-xs text-fg-muted hover:text-fg"
            >
              지우기
            </button>
          )}
        </div>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          placeholder="설명 (선택). 링크·파일 경로가 없다면 이 항목은 필수."
          className="block w-full border border-line-strong bg-surface px-3 py-1.5 text-sm focus:border-primary focus:outline-none "
        />
        {error && <p role="alert" aria-live="assertive" className="text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending || (!form.externalUrl && !form.fileReference && !form.description)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg transition-colors duration-swift hover:bg-primary-hover disabled:bg-subtle disabled:text-fg-disabled"
          >
            {pending ? "추가 중..." : "증빙 추가"}
          </button>
        </div>
      </div>

      {evidences.length > 0 && (
        <ul className="mt-6 divide-y divide-line border-t border-line pt-4">
          {evidences.map((e) => (
            <li key={e.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-fg-muted">
                    <span className="bg-subtle px-1.5 py-0.5">{EVIDENCE_TYPE_LABEL[e.type as EvidenceType] ?? e.type}</span>
                    <span>{formatKoreanDate(new Date(e.createdAt))}</span>
                    {e.uploaderName && <span>· {e.uploaderName}</span>}
                  </div>
                  {e.externalUrl && (
                    <a
                      href={e.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-sm text-primary-text hover:underline"
                    >
                      {e.externalUrl}
                    </a>
                  )}
                  {e.fileReference && (
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <button
                        type="button"
                        onClick={() => openFile(e.id)}
                        className="text-primary-text hover:underline"
                      >
                        파일 열기 →
                      </button>
                      <span className="break-all text-xs text-fg-muted">{e.fileReference}</span>
                    </div>
                  )}
                  {e.description && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{e.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(e.id)}
                  disabled={pending}
                  className="whitespace-nowrap tabular text-xs text-danger hover:underline disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
