// 법제처 행정규칙 Open API 클라이언트
// 목록: lawSearch.do?target=admrul
// 상세: lawService.do?target=admrul&ID=<행정규칙ID>

import type {
  AdminRuleDetailResponse,
  AdminRuleListItem,
  AdminRuleSearchResponse,
} from "./types";

const BASE_URL = process.env.LAW_API_BASE_URL ?? "https://www.law.go.kr/DRF";

interface FetchOptions {
  retries?: number;
  retryDelayMs?: number;
}

async function fetchJson<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  opts: FetchOptions = {},
): Promise<T> {
  const oc = process.env.LAW_API_OC;
  if (!oc) throw new Error("LAW_API_OC is not set in environment");

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("OC", oc);
  url.searchParams.set("type", "JSON");
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  const retries = opts.retries ?? 3;
  const delay = opts.retryDelayMs ?? 800;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.pathname}`);
      const text = await res.text();
      if (!text.trim().startsWith("{")) {
        throw new Error(`Non-JSON response: ${text.slice(0, 100)}`);
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// ────────── 검색 ──────────
export interface SearchAdminRulesParams {
  query?: string;
  display?: number;
  page?: number;
  org?: string; // 소관부처 코드
  knd?: string; // 행정규칙 종류 (고시=B0003, 훈령=B0001, 예규=B0002 등 — 코드 확실치 않으면 이름 필터로 사후 처리)
  ancYd?: string; // 발령일자 범위 YYYYMMDD~YYYYMMDD
}

export async function searchAdminRules(params: SearchAdminRulesParams): Promise<{
  totalCount: number;
  items: AdminRuleListItem[];
}> {
  const res = await fetchJson<AdminRuleSearchResponse>("/lawSearch.do", {
    target: "admrul",
    query: params.query,
    display: params.display ?? 20,
    page: params.page ?? 1,
    org: params.org,
    knd: params.knd,
    ancYd: params.ancYd,
  });
  const search = res.AdmRulSearch;
  return {
    totalCount: Number(search.totalCnt ?? "0"),
    items: toArray(search.admrul),
  };
}

// ────────── 상세 ──────────
export async function fetchAdminRuleDetail(admRulId: string): Promise<AdminRuleDetailResponse> {
  return fetchJson<AdminRuleDetailResponse>("/lawService.do", {
    target: "admrul",
    ID: admRulId,
  });
}

// ID 파라미터는 행정규칙일련번호를 받는다. 그 일련번호는 목록 검색으로만 구할 수
// 있는데, 폐지된 규정은 검색에 안 잡히고 "행정서비스헌장규정" 처럼 흔한 제목은
// 상위 30건 밖으로 밀려 못 찾는다. LID 파라미터는 행정규칙ID 를 직접 받으므로
// 검색을 건너뛸 수 있고, 응답에 행정규칙일련번호도 함께 온다.
export async function fetchAdminRuleDetailByRuleId(
  admRulId: string,
): Promise<AdminRuleDetailResponse> {
  return fetchJson<AdminRuleDetailResponse>("/lawService.do", {
    target: "admrul",
    LID: admRulId,
  });
}
