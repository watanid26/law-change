import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit vs Integration 분리:
// - Unit(빠름, DB 불필요): src/**/*.test.ts
// - Integration(DB 필요): tests/integration/**/*.test.ts — 별도 run
// 기본은 unit만. integration은 `npm run test:integration` 으로 실행.
const includeIntegration = process.env.VITEST_INCLUDE_INTEGRATION === "1";

export default defineConfig({
  test: {
    include: includeIntegration
      ? ["src/**/*.test.ts", "tests/integration/**/*.test.ts"]
      : ["src/**/*.test.ts"],
    environment: "node",
    exclude: ["node_modules", ".next"],
    testTimeout: 30_000,
    // .env.local 로드 (모든 import 이전에 실행)
    setupFiles: ["tests/setup.ts"],
    // Integration 은 shared DB row 를 다루는 파일이 여럿이라 파일 병렬 시 flake 유발.
    // (예: reconciliation_progress partial unique, tenant-integrity 픽스처 등)
    // 파일 단위 sequential 실행으로 재현성 확보 — 각 파일 내부는 그대로 병렬.
    fileParallelism: !includeIntegration,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
