// 매일 도는 증분 수집 — 네 소스를 한 배치로.
//
// 날짜 창(overlap)을 쓰지 않는다. 2026-09-01 실측에서 recentDays 방식으로는
// 그날 개정 84건이 통째로 빠져 있었다. 대신 소스 성격에 맞는 두 가지를 쓴다.
//
//   법령·행정규칙 — 최신순(sort=ddes)으로 읽다가 이미 아는 것이 연속으로
//     STOP_STREAK 건 나오면 중단. 실측에서 행정규칙은 아는 것이 연속으로 나온
//     최대 구간이 40건이었다(같은 날 발령분이 섞여 나온다). 200 은 그 5배다.
//     표본 300건만 봤을 때 56건으로 보이던 누락이 끝까지 파니 72건이었다 —
//     얕게 끊으면 놓친 줄도 모른다.
//
//   해석례·결정문 — 전체가 4천~9천건뿐이라 목록 전수를 8~18초에 훑는다.
//     날짜 기준이었으면 지연 등록분을 놓쳤다. 해석례는 해석일자와 등록일시가
//     중앙 1,681일, 최대 12년까지 벌어진다.
//
// 소스별로 독립적으로 돌고 결과도 따로 남긴다. 하나가 실패해도 나머지는 간다.

import { prisma } from "@/lib/prisma";
import { syncLawDocument } from "./detail";
import { syncAdminRuleDocument } from "./admin-rule-detail";
import { syncInterpretations } from "./interpretation";
import { syncDecisions } from "./decision";

export const STOP_STREAK = 200;
const PAGE_SIZE = 100;
const MAX_PAGES = 40;

export interface SourceResult {
  source: string;
  scanned: number;
  collected: number;
  failed: number;
  /** 시간이 모자라 중간에 멈췄는지. 다음 배치가 이어서 한다. */
  truncated: boolean;
  durationMs: number;
  error?: string;
}

export interface IncrementalReport {
  startedAt: string;
  finishedAt: string;
  results: SourceResult[];
}

interface Budget {
  deadline: number;
}
const timeLeft = (b: Budget) => b.deadline - Date.now();

// 소스별로 예산을 나눠 준다. 앞 소스가 다 먹으면 뒤 소스는 매일 굶는다 —
// 첫 실행에서 행정규칙이 198초를 쓰는 바람에 해석례·결정문이 한 건도 못
// 돌았다. 남은 시간은 뒤 소스로 넘어가므로 총합은 그대로다.
const SHARE: Record<string, number> = {
  LAW: 0.2, ADMIN_RULE: 0.3, EXPC: 0.2, FTC: 0.15, PPC: 0.15,
};

async function listLegal(target: "law" | "admrul", page: number): Promise<Record<string, unknown>[]> {
  const oc = process.env.LAW_API_OC;
  if (!oc) throw new Error("LAW_API_OC is not set in environment");
  const u = new URL(`${process.env.LAW_API_BASE_URL ?? "https://www.law.go.kr/DRF"}/lawSearch.do`);
  u.searchParams.set("OC", oc);
  u.searchParams.set("type", "JSON");
  u.searchParams.set("target", target);
  u.searchParams.set("sort", "ddes");
  u.searchParams.set("display", String(PAGE_SIZE));
  u.searchParams.set("page", String(page));
  const res = await fetch(u.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!text.trim().startsWith("{")) return [];
  const j = JSON.parse(text) as Record<string, Record<string, unknown>>;
  const raw = target === "law" ? j.LawSearch?.law : j.AdmRulSearch?.admrul;
  if (raw == null) return [];
  return (Array.isArray(raw) ? raw : [raw]) as Record<string, unknown>[];
}

/** 목록 최신순으로 훑으며 DB 에 없는 문서·판을 찾아 수집한다. */
async function syncLegalSource(
  target: "law" | "admrul",
  budget: Budget,
  slice: number,
): Promise<SourceResult> {
  const t0 = Date.now();
  const isLaw = target === "law";
  const sourceType = isLaw ? "LAW" : "ADMIN_RULE";
  const idKey = isLaw ? "법령ID" : "행정규칙ID";
  const verKey = isLaw ? "법령일련번호" : "행정규칙일련번호";
  const nameKey = isLaw ? "법령명한글" : "행정규칙명";

  const result: SourceResult = {
    source: sourceType, scanned: 0, collected: 0, failed: 0, truncated: false, durationMs: 0,
  };
  const todo: { ext: string; ver: string; name: string }[] = [];
  let streak = 0;
  // 이 소스에 허용된 마감. 전체 마감보다 늦출 수는 없다.
  const localDeadline = Math.min(budget.deadline, Date.now() + slice);
  const localLeft = () => localDeadline - Date.now();

  outer: for (let page = 1; page <= MAX_PAGES; page++) {
    if (localLeft() < 15_000) { result.truncated = true; break; }
    const items = await listLegal(target, page);
    if (items.length === 0) break;
    // 항목마다 두 번씩 물으면 100건에 200번이다. 페이지 단위로 한 번에 묻는다.
    const exts = items.map((it) => String(it[idKey] ?? "")).filter(Boolean);
    const vers = items.map((it) => String(it[verKey] ?? "")).filter(Boolean);
    const docs = await prisma.legalDocument.findMany({
      where: { externalDocumentId: { in: exts }, legalSource: { sourceType } },
      select: { id: true, externalDocumentId: true },
    });
    const docByExt = new Map(docs.map((d) => [d.externalDocumentId, d.id]));
    const seenPairs = new Set<string>();
    if (docByExt.size > 0) {
      const rows = await prisma.legalDocumentVersion.findMany({
        where: {
          documentId: { in: [...docByExt.values()] },
          externalVersionId: { in: vers },
        },
        select: { documentId: true, externalVersionId: true },
      });
      for (const r of rows) seenPairs.add(`${r.documentId}\u0000${r.externalVersionId}`);
    }

    for (const it of items) {
      result.scanned++;
      const ext = String(it[idKey] ?? "");
      const ver = String(it[verKey] ?? "");
      if (!ext || !ver) continue;
      const docId = docByExt.get(ext);
      const seen = Boolean(docId && seenPairs.has(`${docId}\u0000${ver}`));
      if (seen) {
        streak++;
        if (streak >= STOP_STREAK) break outer;
      } else {
        streak = 0;
        todo.push({ ext, ver, name: String(it[nameKey] ?? "") });
      }
    }
  }

  for (const t of todo) {
    if (localLeft() < 10_000) { result.truncated = true; break; }
    try {
      if (isLaw) await syncLawDocument(t.ext, t.name, "LIVE_DETECTION");
      else await syncAdminRuleDocument(t.ext, t.ver, t.name, "LIVE_DETECTION");
      result.collected++;
    } catch {
      result.failed++;
    }
  }
  result.durationMs = Date.now() - t0;
  return result;
}

export async function runIncrementalSync(
  opts: { budgetMs?: number } = {},
): Promise<IncrementalReport> {
  const startedAt = new Date();
  // Vercel 함수 상한(maxDuration) 안에서 끝내야 한다. 남기고 멈추는 편이
  // 중간에 잘려 결과를 못 남기는 것보다 낫다.
  const totalMs = opts.budgetMs ?? 240_000;
  const budget: Budget = { deadline: Date.now() + totalMs };
  const results: SourceResult[] = [];

  for (const target of ["law", "admrul"] as const) {
    const key = target === "law" ? "LAW" : "ADMIN_RULE";
    try {
      results.push(await syncLegalSource(target, budget, totalMs * SHARE[key]));
    } catch (err) {
      results.push({
        source: target === "law" ? "LAW" : "ADMIN_RULE",
        scanned: 0, collected: 0, failed: 0, truncated: true, durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (timeLeft(budget) > 20_000) {
    const t0 = Date.now();
    try {
      const s = await syncInterpretations();
      results.push({
        source: "EXPC", scanned: s.scanned, collected: s.created + s.updated,
        failed: s.failed, truncated: false, durationMs: Date.now() - t0,
      });
    } catch (err) {
      results.push({
        source: "EXPC", scanned: 0, collected: 0, failed: 0, truncated: true,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    results.push({ source: "EXPC", scanned: 0, collected: 0, failed: 0, truncated: true, durationMs: 0 });
  }

  for (const src of ["FTC", "PPC"] as const) {
    if (timeLeft(budget) < 20_000) {
      results.push({ source: src, scanned: 0, collected: 0, failed: 0, truncated: true, durationMs: 0 });
      continue;
    }
    const t0 = Date.now();
    try {
      const s = await syncDecisions(src);
      results.push({
        source: src, scanned: s.scanned, collected: s.created + s.updated,
        failed: s.failed, truncated: false, durationMs: Date.now() - t0,
      });
    } catch (err) {
      results.push({
        source: src, scanned: 0, collected: 0, failed: 0, truncated: true,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 소스별로 한 줄씩 남긴다. 하나가 실패해도 다른 소스의 성공 기록과 섞이지 않는다.
  for (const r of results) {
    await prisma.collectorRun.create({
      data: {
        jobType: `INCREMENTAL_${r.source}`,
        status: r.error ? "FAILED" : r.truncated ? "PARTIAL" : "SUCCESS",
        startedAt,
        finishedAt: new Date(),
        scannedCount: r.scanned,
        newCount: r.collected,
        successCount: r.collected,
        failCount: r.failed,
        errorMessage: r.error ?? null,
        metadata: { durationMs: r.durationMs, truncated: r.truncated },
      },
    });
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    results,
  };
}
