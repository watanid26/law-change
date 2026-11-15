import * as dotenv from "dotenv";
// Next.js convention: single source of truth in .env.local
dotenv.config({ path: ".env.local" });

import { defineConfig } from "prisma/config";

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";
// Migration은 반드시 direct connection(port 5432)으로 실행 — pooler(6543)는 prepared statement 미지원
const directUrl = process.env.DIRECT_URL || databaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: directUrl,
  },
});
