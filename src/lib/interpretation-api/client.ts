// 법제처 법령해석례 Open API 클라이언트
//   목록: lawSearch.do?target=expc   (전체 8,823건 · 89회 호출 17초)
//   상세: lawService.do?target=expc&ID=<법령해석례일련번호>

import type {
  InterpretationDetail,
  InterpretationDetailResponse,
  InterpretationListItem,
  InterpretationSearchResponse,
} from "./types";

const BASE_URL = process.env.LAW_API_BASE_URL ?? "https://www.law.go.kr/DRF";

async function fetchJson<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  retries = 3,
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

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.pathname}`);
      const text = await res.text();
      // 오류는 HTML 페이지로 돌아온다. JSON 이 아니면 실패로 본다.
      if (!text.trim().startsWith("{")) {
        throw new Error(`Non-JSON response: ${text.slice(0, 100)}`);
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export interface InterpretationPage {
  items: InterpretationListItem[];
  total: number;
}

export async function searchInterpretations(params: {
  page?: number;
  display?: number;
  /** "ddes" 면 회신일자 최신순. */
  sort?: string;
  query?: string;
}): Promise<InterpretationPage> {
  const res = await fetchJson<InterpretationSearchResponse>("/lawSearch.do", {
    target: "expc",
    display: params.display ?? 100,
    page: params.page ?? 1,
    sort: params.sort,
    query: params.query,
  });
  return {
    items: toArray(res.Expc?.expc),
    total: Number(res.Expc?.totalCnt ?? 0),
  };
}

export async function fetchInterpretationDetail(
  externalId: string,
): Promise<InterpretationDetail | null> {
  const res = await fetchJson<InterpretationDetailResponse>("/lawService.do", {
    target: "expc",
    ID: externalId,
  });
  return res.ExpcService ?? null;
}
