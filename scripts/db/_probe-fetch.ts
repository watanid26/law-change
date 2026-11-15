// 법제처 API fetch가 실제로 응답하는지 격리 테스트.
// 실행: set -a && source .env.local && set +a && npx tsx scripts/db/_probe-fetch.ts

const OC = process.env.LAW_API_OC;
if (!OC) throw new Error("LAW_API_OC not set");

const BASE = "https://www.law.go.kr/DRF";

async function probe(label: string, url: string) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    const ms = Date.now() - t0;
    console.log(`[${label}] status=${res.status} bytes=${text.length} · ${ms}ms`);
  } catch (e: any) {
    const ms = Date.now() - t0;
    console.log(`[${label}] ERROR ${ms}ms: ${e?.name}: ${e?.message}`);
  }
}

(async () => {
  // 1) 실패한 잡의 sourceId 하나 시도 — LAW/002249 (RUNNING이었던 잡)
  //    fetchLawHistoryByExternalId 는 이름으로 검색 → 근데 이름을 모르니 그냥 임의 검색
  const search = `${BASE}/lawSearch.do?OC=${OC}&type=JSON&target=eflaw&query=%EA%B1%B4%EC%B6%95%EB%B2%95&display=100&page=1`;
  const detail = `${BASE}/lawService.do?OC=${OC}&type=JSON&target=eflaw&MST=250137`;

  console.log("=== 3 sequential probes ===");
  await probe("search-1", search);
  await probe("search-2", search);
  await probe("detail-1", detail);

  console.log("\n=== 5 parallel probes ===");
  await Promise.all([
    probe("par-1", search),
    probe("par-2", search),
    probe("par-3", detail),
    probe("par-4", detail),
    probe("par-5", search),
  ]);
})();
