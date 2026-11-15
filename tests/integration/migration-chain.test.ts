// Integration test: 실 Sequential Migration Chain (Round 4.6)
//
// 목적: `migration-safety.test.ts` 의 SQL snippet 단위 테스트로는 잡히지 않는
// migration chain 문제를 실제 sequential 적용으로 검증한다.
//
// 접근:
//   1) 격리된 PostgreSQL 스키마 (test_migchain_*) 를 생성
//   2) 각 migration.sql 을 순차 raw 실행 (search_path 로 스키마 지정)
//   3) 시나리오별 상태 검증 (clean / 이전-버전-데이터 존재 / dirty-recon / legacy-row)
//   4) 스키마 DROP CASCADE 로 정리 — 실 public 데이터에 영향 없음
//
// 주의: migration.sql 파일들은 스키마 prefix 없이 쓰여있어 search_path 로 리다이렉트.
// 일부 DO 블록의 `information_schema.tables WHERE table_schema = 'public'` 는 격리
// 스키마에서 조회되지 않음 → 해당 guard 는 실제 문서화된 정책만 검증하고, 격리 테스트는
// "chain 이 순차 성공하는가" 에 집중.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

// 이 테스트는 격리 스키마에서 raw DDL 을 대량으로 실행하므로 pgbouncer transaction
// 모드에서는 SET/DDL/prepared statement 충돌로 hang 이 발생한다 (특히 v12 의
// workspace_member FK 재정의). 별도 클라이언트를 DIRECT_URL 로 연결.
const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!directUrl) throw new Error("DIRECT_URL required for migration-chain tests");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl } },
});

function listMigrations(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((n) => /^\d{14}_/.test(n)) // 폴더 명 규칙: YYYYMMDDHHMMSS_
    .sort();
}

function readMigrationSql(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf-8");
}

async function createIsolatedSchema(): Promise<string> {
  const name = `test_migchain_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${name}"`);
  return name;
}

async function dropSchema(name: string): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
}

// Migration 파일 안의 information_schema 참조는 'public' 리터럴을 갖고 있음.
// 격리 테스트에선 그 부분을 격리 스키마 이름으로 치환하여 guard 로직도 동작하도록.
function rewriteForSchema(sql: string, schema: string): string {
  return sql.replaceAll("table_schema = 'public'", `table_schema = '${schema}'`);
}

// SQL 을 개별 statement 로 분할.
// - 홑따옴표 문자열 안 세미콜론 무시
// - $$ ... $$ (empty-tag) dollar-quoted 블록 안 세미콜론 무시
// - -- 로 시작하는 라인 주석 무시
// - /* ... */ 블록 주석 무시
// Prisma $executeRawUnsafe 는 prepared statement 라 다중 문을 못 넣으므로 필수.
function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let inDollar = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      buf += ch;
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      buf += ch;
      if (ch === "*" && next === "/") { buf += next; i += 2; inBlockComment = false; continue; }
      i += 1;
      continue;
    }
    if (!inSingle && !inDollar && ch === "-" && next === "-") {
      inLineComment = true; buf += ch; i += 1; continue;
    }
    if (!inSingle && !inDollar && ch === "/" && next === "*") {
      inBlockComment = true; buf += ch; buf += next; i += 2; continue;
    }
    if (!inDollar && ch === "'") {
      // 홑따옴표 이스케이프 '' 처리
      buf += ch;
      i += 1;
      if (inSingle && sql[i] === "'") { buf += "'"; i += 1; continue; }
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && ch === "$" && next === "$") {
      buf += "$$";
      i += 2;
      inDollar = !inDollar;
      continue;
    }
    if (!inSingle && !inDollar && ch === ";") {
      const trimmed = buf.trim();
      if (trimmed.length > 0) stmts.push(trimmed);
      buf = "";
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  const tail = buf.trim();
  if (tail.length > 0) stmts.push(tail);
  return stmts;
}

// 스키마 안에서 migration.sql 순차 실행 — 각 문을 개별 executeRawUnsafe.
async function runInSchema(schema: string, sql: string): Promise<void> {
  const statements = splitStatements(sql);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    for (const stmt of statements) {
      // BEGIN/COMMIT 은 이미 트랜잭션 안이라 무의미 → 건너뜀
      const s = stmt.replace(/;$/, "").trim();
      const upper = s.toUpperCase();
      if (upper === "BEGIN" || upper === "COMMIT" || upper === "ROLLBACK") continue;
      await tx.$executeRawUnsafe(s);
    }
  }, { timeout: 60_000 });
}

// 격리 스키마 리스트를 추적하여 정리
const createdSchemas: string[] = [];
afterEach(async () => {
  while (createdSchemas.length > 0) {
    const s = createdSchemas.pop()!;
    try { await dropSchema(s); } catch { /* ignore */ }
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ────────────────────────────────────────────────────────────────
describe("Sequential migration chain", () => {
  it("Case 1: clean DB (0 → latest) 순차 적용 성공", async () => {
    const schema = await createIsolatedSchema();
    createdSchemas.push(schema);
    const migrations = listMigrations();
    expect(migrations.length).toBeGreaterThanOrEqual(11); // v0..v11

    for (const m of migrations) {
      const sql = rewriteForSchema(readMigrationSql(m), schema);
      try {
        await runInSchema(schema, sql);
      } catch (err) {
        throw new Error(`Migration ${m} failed on clean DB: ${(err as Error).message}`);
      }
    }

    // 핵심 constraint 존재 확인 (composite unique 몇 개)
    const uniques = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1
         AND indexname IN (
           'reconciliation_active_source_unique',
           'watch_id_workspace_document_unique',
           'legal_content_unit_version_id_document_unique',
           'task_approval_task_id_unique'
         )`,
      schema,
    );
    expect(uniques.length).toBe(4);

    // Reminder XOR CHECK 존재
    const checks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT conname FROM pg_constraint
       WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
         AND conname = 'reminder_target_exactly_one_check'`,
      schema,
    );
    expect(checks.length).toBe(1);
  }, 120_000);

  it("Case 2: dirty recon (v7 상태 + duplicate RUNNING) 은 v8 partial unique 에서 실패", async () => {
    const schema = await createIsolatedSchema();
    createdSchemas.push(schema);
    const migrations = listMigrations();

    // v0 ~ v7 까지 적용
    const v7Idx = migrations.findIndex((n) => n.includes("schema_v7_db_freeze"));
    expect(v7Idx).toBeGreaterThan(0);
    for (let i = 0; i <= v7Idx; i += 1) {
      const sql = rewriteForSchema(readMigrationSql(migrations[i]), schema);
      await runInSchema(schema, sql);
    }

    // 같은 source_type 에 RUNNING 세션 2개 강제 삽입 (v7 상태에선 아직 partial unique 없음)
    await runInSchema(schema, `
      INSERT INTO "reconciliation_progress"
        (id, source_type, session_id, cursor_page, status, started_at, updated_at, heartbeat_at)
      VALUES
        ('dup_a', 'LAW', 'sess_A', 5, 'RUNNING', NOW(), NOW(), NOW()),
        ('dup_b', 'LAW', 'sess_B', 8, 'RUNNING', NOW(), NOW(), NOW())
    `);

    // v8 적용 시도 → partial unique index 생성이 반드시 실패
    const v8 = migrations[v7Idx + 1];
    const v8Sql = rewriteForSchema(readMigrationSql(v8), schema);
    let v8Err: Error | null = null;
    try {
      await runInSchema(schema, v8Sql);
    } catch (e) {
      v8Err = e as Error;
    }
    expect(v8Err).toBeTruthy();
    expect(v8Err!.message).toMatch(/could not create unique index|duplicate key|is duplicated/i);
  }, 120_000);

  it("Case 3: pre-v8 cleanup 스크립트 실행 후엔 v8 이상 정상 적용", async () => {
    const schema = await createIsolatedSchema();
    createdSchemas.push(schema);
    const migrations = listMigrations();

    // v0..v7 적용
    const v7Idx = migrations.findIndex((n) => n.includes("schema_v7_db_freeze"));
    for (let i = 0; i <= v7Idx; i += 1) {
      const sql = rewriteForSchema(readMigrationSql(migrations[i]), schema);
      await runInSchema(schema, sql);
    }

    // duplicate 삽입
    await runInSchema(schema, `
      INSERT INTO "reconciliation_progress"
        (id, source_type, session_id, cursor_page, status, started_at, updated_at, heartbeat_at)
      VALUES
        ('dup_a', 'LAW', 'sess_A', 5, 'RUNNING', NOW(), NOW(), NOW() - INTERVAL '10 minutes'),
        ('dup_b', 'LAW', 'sess_B', 8, 'RUNNING', NOW(), NOW(), NOW())
    `);

    // pre-v8 cleanup 스크립트 실행
    const cleanupSql = fs.readFileSync(
      path.join(process.cwd(), "scripts", "db", "pre-v8-reconciliation-cleanup.sql"),
      "utf-8",
    );
    await runInSchema(schema, cleanupSql);

    // 이제 v8~v11 까지 성공해야 함
    for (let i = v7Idx + 1; i < migrations.length; i += 1) {
      const sql = rewriteForSchema(readMigrationSql(migrations[i]), schema);
      try {
        await runInSchema(schema, sql);
      } catch (err) {
        throw new Error(`Migration ${migrations[i]} failed after pre-v8 cleanup: ${(err as Error).message}`);
      }
    }

    // cleanup 결과 검증: RUNNING 정확히 1개, 다른 하나는 FAILED
    const rows = await prisma.$queryRawUnsafe<Array<{ status: string; c: number }>>(
      `SELECT status, COUNT(*)::int AS c
         FROM "${schema}"."reconciliation_progress"
        WHERE source_type = 'LAW'
        GROUP BY status`,
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.c]));
    expect(byStatus.RUNNING).toBe(1);
    expect(byStatus.FAILED).toBe(1);
  }, 180_000);

  it("Case 4: legacy user table + row 존재 시 v9 guard 가 명시적으로 실패", async () => {
    const schema = await createIsolatedSchema();
    createdSchemas.push(schema);
    const migrations = listMigrations();

    // v0..v6 만 적용 (v7 이 legacy DROP 이므로 그 전 단계까지)
    const v6Idx = migrations.findIndex((n) => n.includes("schema_v6_r42"));
    for (let i = 0; i <= v6Idx; i += 1) {
      const sql = rewriteForSchema(readMigrationSql(migrations[i]), schema);
      await runInSchema(schema, sql);
    }

    // v9 guard 가 검사하는 이름 (user_watch) 을 확실히 데이터 있는 상태로 재현.
    // v6 시점 스키마와 무관하게 fresh 로 강제.
    await runInSchema(schema, `DROP TABLE IF EXISTS "user_watch" CASCADE`);
    await runInSchema(schema, `CREATE TABLE "user_watch" (id text PRIMARY KEY)`);
    await runInSchema(schema, `INSERT INTO "user_watch" (id) VALUES ('DO_NOT_DROP')`);

    // v7 적용 시도 → v7 에서 legacy DROP 을 무방비로 하면 데이터 손실.
    // 여기선 v9 guard 를 대신 실행하여 exception 발생을 검증.
    // (v7 자체는 이미 DROP 을 수행하므로 v7 통과를 원하지 않음 — 정책 검증 목적)
    const v9Sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, "20260808143000_schema_v9_r45_tenant_integrity", "migration.sql"),
      "utf-8",
    );
    const rewritten = rewriteForSchema(v9Sql, schema);
    let err: Error | null = null;
    try {
      await runInSchema(schema, rewritten);
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeTruthy();
    expect(err!.message).toMatch(/refusing to drop silently|legacy table/i);
    // 데이터는 그대로
    const rows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM "${schema}"."user_watch"`,
    );
    expect(rows[0].c).toBe(1);
  }, 120_000);
});
