"use client";

// 서버 액션 / API route 호출 공용 훅.
//
// - React 18의 startTransition(async () => {...}) 은 catch 이후의 setState 를 배치·롤백하며
//   실패가 사용자에게 조용히 묻히는 알려진 버그가 있어 사용하지 않는다 (QA 라운드 3~4).
// - 대신 await 는 transition 밖에서 직접 실행하고, 후속 router.refresh() 같은 대형 트리
//   재reconcile 만 React.startTransition 으로 감싸 concurrent 모드로 처리 (QA 라운드 5).
// - throw 되는 예외는 반드시 잡아 사용자에게 명시적 에러 문구를 표시한다.
// - 상태 초기화는 flushSync 로 강제 렌더링하여 "이전 성공 메시지가 남아있는" 문제 방지.
//
// runFetch: HTTP 상태를 primary source of truth 로 사용. Server Actions 는 응답 body 의
// {ok:true} 를 파싱하기 때문에 Vercel edge 가 5xx 로 wrap 해도 client 가 성공으로 오인하는
// 문제가 있다 (QA 라운드 7). API route + fetch 로 전환하면 res.status 로 확실히 분기.

import { startTransition, useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

interface AsyncStatus {
  kind: "idle" | "ok" | "error";
  msg?: string;
}

interface UseAsyncActionResult {
  pending: boolean;
  status: AsyncStatus;
  reset: () => void;
  run: <T>(
    fn: () => Promise<ActionResult<T>>,
    onOk?: (data: T | undefined) => void,
    successMsg?: string,
  ) => Promise<void>;
  runWithRefresh: <T>(
    fn: () => Promise<ActionResult<T>>,
    onOk?: (data: T | undefined) => void,
    successMsg?: string,
  ) => Promise<void>;
  /** API route 호출 전용 — HTTP 상태를 명시 판정. Server Action 의 auto-refresh 도 회피. */
  runFetch: <T = unknown>(
    input: RequestInit & { url: string },
    onOk?: (data: T | undefined) => void,
    successMsg?: string,
  ) => Promise<void>;
}

const NETWORK_ERR_MSG =
  "요청이 서버에 도달하지 못했습니다. 네트워크를 확인하고 다시 시도해주세요.";
const MALFORMED_MSG =
  "서버 응답 형식이 올바르지 않습니다. 데이터가 저장됐는지 확인 후 다시 시도해주세요.";
const SERVER_ERR_MSG =
  "서버가 응답하지 못했습니다. 잠시 후 다시 시도해주세요.";
// 라운드 8 QA 지적: 프리징 후 실패한 경우 화면에 아무 안내가 없이 그냥 멎는다.
// 20초는 사용자가 참을 만한 최대 대기. 이후 명시적 실패로 전환해서 재시도를 유도한다.
// (Vercel 함수 자체가 30초 timeout 이라 그 전에 client 가 먼저 포기해 revert 를 트리거.)
const CLIENT_TIMEOUT_MS = 20000;
const TIMEOUT_MSG =
  "서버 응답이 너무 오래 걸립니다 (20초 초과). 잠시 후 다시 시도해주세요.";

export function useAsyncAction(): UseAsyncActionResult {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<AsyncStatus>({ kind: "idle" });

  const reset = useCallback(() => setStatus({ kind: "idle" }), []);

  const runInner = useCallback(async <T,>(
    fn: () => Promise<ActionResult<T>>,
    onOk: ((data: T | undefined) => void) | undefined,
    successMsg: string | undefined,
    withRefresh: boolean,
  ) => {
    // 상태 초기화. flushSync 는 예전 라운드에 이전 성공 메시지가 남는 이슈 방지용이었으나,
    // 라운드 9 QA: 실제 프리징이 렌더러 메인스레드 블로킹으로 밝혀졌다.
    // flushSync 는 동기 커밋을 강제해 대형 트리 재reconcile 을 유발할 수 있어 제거.
    // "이전 성공 메시지가 잠깐 남는" 부작용은 이미 optimistic snapshot + useEffect 로 커버됨.
    setStatus({ kind: "idle" });
    setPending(true);
    try {
      const res = await fn();
      if (!res || typeof res !== "object" || !("ok" in res) || typeof res.ok !== "boolean") {
        setStatus({ kind: "error", msg: MALFORMED_MSG });
        return;
      }
      if (!res.ok) {
        const errMsg = "error" in res && typeof res.error === "string"
          ? res.error
          : "요청을 처리할 수 없습니다.";
        setStatus({ kind: "error", msg: errMsg });
        return;
      }
      if (successMsg) setStatus({ kind: "ok", msg: successMsg });
      const data = "data" in res ? res.data : undefined;
      if (onOk) onOk(data as T | undefined);
      if (withRefresh) {
        startTransition(() => { router.refresh(); });
      }
    } catch (err) {
      console.error("[useAsyncAction] threw", err);
      setStatus({ kind: "error", msg: NETWORK_ERR_MSG });
    } finally {
      setPending(false);
    }
  }, [router]);

  const run = useCallback(<T,>(
    fn: () => Promise<ActionResult<T>>,
    onOk?: (data: T | undefined) => void,
    successMsg?: string,
  ) => runInner(fn, onOk, successMsg, false), [runInner]);

  const runWithRefresh = useCallback(<T,>(
    fn: () => Promise<ActionResult<T>>,
    onOk?: (data: T | undefined) => void,
    successMsg?: string,
  ) => runInner(fn, onOk, successMsg, true), [runInner]);

  const runFetch = useCallback(async <T = unknown,>(
    input: RequestInit & { url: string },
    onOk?: (data: T | undefined) => void,
    successMsg?: string,
  ) => {
    // 상태 초기화. flushSync 는 예전 라운드에 이전 성공 메시지가 남는 이슈 방지용이었으나,
    // 라운드 9 QA: 실제 프리징이 렌더러 메인스레드 블로킹으로 밝혀졌다.
    // flushSync 는 동기 커밋을 강제해 대형 트리 재reconcile 을 유발할 수 있어 제거.
    // "이전 성공 메시지가 잠깐 남는" 부작용은 이미 optimistic snapshot + useEffect 로 커버됨.
    setStatus({ kind: "idle" });
    setPending(true);
    const { url, ...init } = input;
    // AbortController 로 client 측 timeout 강제.
    // Vercel serverless 콜드스타트 시 첫 요청이 30+초 걸리는 케이스를 사용자 UX 층에서 컷.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: init.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
        ...init,
        signal: controller.signal,
      });
      // HTTP 상태가 primary truth. Server Action 의 auto-refresh 도 없음.
      if (res.status >= 500) {
        setStatus({ kind: "error", msg: `${SERVER_ERR_MSG} (HTTP ${res.status})` });
        return;
      }
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        setStatus({ kind: "error", msg: MALFORMED_MSG });
        return;
      }
      if (!res.ok) {
        const errMsg = json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
          ? (json as { error: string }).error
          : "요청을 처리할 수 없습니다.";
        setStatus({ kind: "error", msg: errMsg });
        return;
      }
      if (!json || typeof json !== "object" || !("ok" in json) || (json as { ok?: unknown }).ok !== true) {
        setStatus({ kind: "error", msg: MALFORMED_MSG });
        return;
      }
      if (successMsg) setStatus({ kind: "ok", msg: successMsg });
      const data = (json as { data?: unknown }).data;
      if (onOk) onOk(data as T | undefined);
    } catch (err) {
      // AbortController.abort() 로 인한 실패는 timeout 안내로 구분.
      if ((err as { name?: string })?.name === "AbortError") {
        console.warn(`[useAsyncAction.runFetch] client-side timeout > ${CLIENT_TIMEOUT_MS}ms`, url);
        setStatus({ kind: "error", msg: TIMEOUT_MSG });
      } else {
        console.error("[useAsyncAction.runFetch] threw", err);
        setStatus({ kind: "error", msg: NETWORK_ERR_MSG });
      }
    } finally {
      clearTimeout(timeoutId);
      setPending(false);
    }
  }, []);

  return { pending, status, reset, run, runWithRefresh, runFetch };
}
