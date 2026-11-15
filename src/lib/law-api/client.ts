import type {
  LawDetailResponse,
  LawListItem,
  LawSearchResponse,
} from "./types";

const BASE_URL = process.env.LAW_API_BASE_URL ?? "https://www.law.go.kr/DRF";
const OC = process.env.LAW_API_OC;

if (!OC) {
  // Only throw at call time; module import shouldn't blow up during Next build
}

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
        // Batch job, not user-facing; longer timeout via AbortSignal.timeout
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.pathname}`);
      const text = await res.text();
      // 법제처 API가 간혹 빈 응답이나 HTML 에러페이지를 JSON 헤더로 반환
      if (!text.trim().startsWith("{")) {
        throw new Error(`Non-JSON response from ${url.pathname}: ${text.slice(0, 100)}`);
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

// 응답에서 배열/단일 객체 모두를 배열로 정규화
export function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// ────────── 법령 검색 ──────────
export interface SearchLawsParams {
  query?: string; // 법령명 키워드
  target?: "law" | "eflaw"; // law=현행, eflaw=시행일 법령(개정 이력 포함)
  display?: number; // 페이지당 (max 100)
  page?: number;
  ancYd?: string; // 공포일자 범위 시작 YYYYMMDD (YYYYMMDD~YYYYMMDD)
  efYd?: string; // 시행일자 범위
  org?: string; // 소관부처 코드
}

export async function searchLaws(params: SearchLawsParams): Promise<{
  totalCount: number;
  items: LawListItem[];
}> {
  const res = await fetchJson<LawSearchResponse>("/lawSearch.do", {
    target: params.target ?? "law",
    query: params.query,
    display: params.display ?? 20,
    page: params.page ?? 1,
    ancYd: params.ancYd,
    efYd: params.efYd,
    org: params.org,
  });
  const search = res.LawSearch;
  return {
    totalCount: Number(search.totalCnt ?? "0"),
    items: toArray(search.law),
  };
}

// ────────── 법령 개정 이력 (시행일별 버전 목록) ──────────
export async function fetchLawHistoryByName(name: string): Promise<LawListItem[]> {
  // 이름으로 검색하되 target=eflaw로 이력·시행예정까지 포함
  const all: LawListItem[] = [];
  let page = 1;
  while (page < 20) {
    const { items, totalCount } = await searchLaws({
      query: name,
      target: "eflaw",
      display: 100,
      page,
    });
    all.push(...items);
    if (all.length >= totalCount || items.length === 0) break;
    page += 1;
  }
  return all;
}

// ────────── 법령 상세 (조문 포함) ──────────
export async function fetchLawDetail(mst: string): Promise<LawDetailResponse> {
  return fetchJson<LawDetailResponse>("/lawService.do", {
    target: "law",
    MST: mst,
  });
}

// 시행일 법령 (특정 시행일자 기준 조문)
export async function fetchEflawDetail(mst: string, efYd?: string): Promise<LawDetailResponse> {
  return fetchJson<LawDetailResponse>("/lawService.do", {
    target: "eflaw",
    MST: mst,
    efYd,
  });
}
