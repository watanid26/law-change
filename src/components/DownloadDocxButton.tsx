"use client";

// 라운드 25: 이전에는 <a href="/api/export/.../diff"> 앵커였음.
// 심사 재검증: fetch() 는 200 정상 · 앵커/직접 URL 접속은 503 반복 재현.
// Vercel Edge 가 navigation 요청(Sec-Fetch-Mode: navigate) 과 fetch(cors) 를
// 다르게 처리하는 것으로 추정. 근본 원인은 로그 필요하나, JS fetch 로 우회하면
// 확실히 작동 + 로딩/에러 UX 부수 확보.

import { useState } from "react";
import { Icon } from "./Icon";

interface Props {
  href: string;
  filename: string;
  label?: string;
}

type State = "idle" | "loading" | "error";

export function DownloadDocxButton({ href, filename, label = "DOCX 내려받기" }: Props) {
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function download() {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch(href);
      if (!res.ok) {
        // 서버가 JSON 에러 응답 (route.ts 500 branch) 이면 message 추출.
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.message) msg += ` · ${body.message}`;
        } catch {
          // JSON 아니면 그대로.
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 브라우저가 다운로드 시작한 뒤 revoke.
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      setState("idle");
    } catch (err) {
      const msg = (err as Error).message;
      console.error("[DOCX download] failed:", msg);
      setErrorMsg(msg);
      setState("error");
      setTimeout(() => {
        setState("idle");
        setErrorMsg("");
      }, 6_000);
    }
  }

  return (
    <div className="inline-flex flex-col gap-1 print-hide">
      <button
        type="button"
        onClick={download}
        disabled={state === "loading"}
        title={state === "error" ? errorMsg : "Word(.docx) 파일로 내려받기"}
        className={
          "inline-flex items-center gap-1.5 border px-4 py-2 text-sm transition-colors duration-swift ease-swift disabled:opacity-70 disabled:cursor-progress " +
          (state === "error"
            ? "border-danger text-danger bg-surface"
            : "border-line text-fg bg-surface hover:bg-hover")
        }
      >
        <Icon name="download" size={14} />
        {state === "loading" ? "생성 중…" : state === "error" ? "다운로드 실패 · 다시 시도" : label}
      </button>
      {state === "error" && errorMsg && (
        <span role="alert" className="text-xs text-danger max-w-[260px] truncate" title={errorMsg}>
          {errorMsg}
        </span>
      )}
    </div>
  );
}
