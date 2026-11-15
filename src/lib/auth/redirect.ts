// Auth 흐름 (/login, /auth/callback, middleware) 에서 사용자 입력 next 파라미터 검증.
// Open Redirect + path traversal 방지 — 반드시 이 헬퍼만 사용.
//
// 정책 (Round 5.1.2 최종):
//   허용:
//     - 최종 canonical pathname 이 정확히 "/app" 또는 "/app/..." 인 same-origin 경로
//     - query / hash 는 그대로 보존
//   불허 → 기본값 "/app":
//     - null / 빈 / 비문자열
//     - scheme URL (http, https, javascript, data, file, ...)
//     - protocol-relative (//evil, ///evil, /\evil)
//     - path traversal: /app/../admin, /app/%2e%2e/admin 등
//     - /app 이외의 라우트 (/admin, /login, /auth/callback, /)
//     - decode / normalize 실패
//
// 구현: WHATWG URL 파서로 canonicalize → path 정규화 (../, %2e%2e 등) 완료 후 검사.

const DEFAULT_PATH = "/app";
// Same-origin 검사 기준. 실제 요청 origin 은 알 필요 없고 canonicalize 만 목적.
const CANON_BASE = "https://lawcheck.invalid";

export function sanitizeNextPath(value: string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0) return DEFAULT_PATH;

  // 1) decode 한 번 — encoded scheme (`javascript%3A...`) 우회 방지.
  //    실패 시 잘못된 percent-encoding → 안전한 fallback.
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return DEFAULT_PATH;
  }

  // 2) 명시적 scheme (`javascript:`, `data:` 등) 조기 차단.
  //    URL parser 는 이 경우 fixed base 기준으로 parse 하지 않을 수 있음.
  if (/^[a-z][a-z0-9+\-.]*:/i.test(decoded)) return DEFAULT_PATH;

  // 3) protocol-relative — `//host`, `\\host`, `/\host` 는 URL parser 가 host 로 인식.
  if (decoded.startsWith("//") || decoded.startsWith("\\\\") || decoded.startsWith("/\\") || decoded.startsWith("\\/")) {
    return DEFAULT_PATH;
  }

  // 4) 반드시 `/` 로 시작 (상대 경로 금지).
  if (!decoded.startsWith("/")) return DEFAULT_PATH;

  // 5) WHATWG URL 파서로 canonicalize — `/app/../admin` → `/admin`,
  //    `/app/%2e%2e/admin` → `/admin`, `\` → `/` 등 정규화.
  let parsed: URL;
  try {
    parsed = new URL(decoded, CANON_BASE);
  } catch {
    return DEFAULT_PATH;
  }

  // 6) origin 방어 — canonical 결과가 다른 origin 이면 절대 안됨.
  if (parsed.origin !== new URL(CANON_BASE).origin) return DEFAULT_PATH;

  // 7) 최종 pathname 이 반드시 /app 스코프.
  const path = parsed.pathname;
  if (path !== "/app" && !path.startsWith("/app/")) return DEFAULT_PATH;

  // 8) query/hash 보존.
  return `${path}${parsed.search}${parsed.hash}`;
}
