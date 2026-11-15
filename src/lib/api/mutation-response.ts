// API route 응답 헬퍼. HTTP 상태를 primary truth 로 삼기 위한 표준 wrapper.
// 반환 body 구조는 { ok, data?, error? } — client 는 res.status 와 body 를 함께 검사.

import { NextResponse } from "next/server";

const KO_ERROR: Record<string, string> = {
  DOCUMENT_NOT_FOUND: "법령을 찾을 수 없습니다.",
  WATCH_NOT_FOUND: "관심 등록을 찾을 수 없거나 접근 권한이 없습니다.",
  MEMBER_NOT_IN_WORKSPACE: "담당자를 찾을 수 없습니다.",
  DEPARTMENT_NOT_IN_WORKSPACE: "담당 부서를 찾을 수 없습니다.",
  FOLDER_NOT_IN_WORKSPACE: "폴더를 찾을 수 없습니다.",
  INBOX_NOT_FOUND: "변경 항목을 찾을 수 없습니다.",
  TASK_NOT_FOUND: "업무를 찾을 수 없습니다.",
  POLICY_NOT_FOUND: "사규를 찾을 수 없습니다.",
  MAPPING_NOT_FOUND: "연결을 찾을 수 없습니다.",
  EVIDENCE_NOT_FOUND: "증빙을 찾을 수 없습니다.",
  UNAUTHORIZED: "로그인이 필요합니다.",
  BAD_REQUEST: "잘못된 요청입니다.",
  INVALID_INPUT: "입력 값이 올바르지 않습니다.",
};

export function okResponse<T>(data?: T) {
  return NextResponse.json({ ok: true, data }, { status: 200 });
}

export function errorResponse(codeOrMessage: string, httpStatus = 400) {
  const message = KO_ERROR[codeOrMessage] ?? codeOrMessage;
  return NextResponse.json({ ok: false, error: message }, { status: httpStatus });
}

export function serverErrorResponse(err: unknown, tag = "api") {
  const e = err as { name?: string; code?: string; message?: string; meta?: unknown };
  console.error(`[${tag}] unexpected`, {
    name: e?.name,
    code: e?.code,
    message: e?.message,
    meta: e?.meta,
  });
  return NextResponse.json(
    { ok: false, error: "요청을 처리할 수 없습니다." },
    { status: 500 },
  );
}
