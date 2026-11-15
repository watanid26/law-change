// 개인정보위(ppc) · 공정위(ftc) 결정문 Open API 클라이언트.
// 두 소스는 호출 규약이 같다 — 목록에 결정문일련번호, 상세는 ID 로 받는다.
//   ppc 4,127건 (목록 42회 8초) · ftc 8,254건 (목록 83회 18초)

const BASE_URL = process.env.LAW_API_BASE_URL ?? "https://www.law.go.kr/DRF";

export type DecisionSource = "PPC" | "FTC";

const TARGET: Record<DecisionSource, string> = { PPC: "ppc", FTC: "ftc" };
const ROOT: Record<DecisionSource, string> = { PPC: "Ppc", FTC: "Ftc" };

async function fetchJson(
  path: string,
  params: Record<string, string | number | undefined>,
  retries = 3,
): Promise<Record<string, unknown>> {
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
      if (!text.trim().startsWith("{")) {
        throw new Error(`Non-JSON response: ${text.slice(0, 100)}`);
      }
      return JSON.parse(text) as Record<string, unknown>;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface DecisionListItem {
  결정문일련번호: string;
  [key: string]: unknown;
}

export async function searchDecisions(
  source: DecisionSource,
  page: number,
  display = 100,
): Promise<DecisionListItem[]> {
  const res = await fetchJson("/lawSearch.do", {
    target: TARGET[source],
    display,
    page,
  });
  const root = res[ROOT[source]] as Record<string, unknown> | undefined;
  const raw = root?.[TARGET[source]];
  if (raw == null) return [];
  return (Array.isArray(raw) ? raw : [raw]) as DecisionListItem[];
}

/**
 * 상세. ppc 는 본문이 `의결서` 아래 한 겹 더 들어가 있고 ftc 는 최상위에 펼쳐져
 * 있다. 호출부가 그 차이를 모르도록 여기서 벗겨서 돌려준다.
 */
export async function fetchDecisionDetail(
  source: DecisionSource,
  externalId: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetchJson("/lawService.do", {
    target: TARGET[source],
    ID: externalId,
  });
  const first = Object.values(res)[0] as Record<string, unknown> | undefined;
  if (!first) return null;
  if (source === "PPC") {
    const inner = first["의결서"];
    return inner && typeof inner === "object" ? (inner as Record<string, unknown>) : null;
  }
  return first;
}
