// server-only 가드: 이 모듈이 어떤 경로로든 client bundle 에 포함되면 build/RSC 층에서
// 즉시 에러로 잡힌다. 라운드 9 QA 에서 preferences/notification.ts → 이 파일이 유출되어
// 브라우저에서 PrismaClient 가 실행되며 83초 (라운드 9) / 460초 (라운드 10) Long Task 를
// 유발한 사고 재발 방지.
//
// 라운드 10 최종: server-only 는 client 실행 시점 throw 인데 그 예외를 어딘가에서 삼키고,
// `new PrismaClient()` 자체가 브라우저에서 계속 재시도되며 CPU 를 태우는 것으로 관측.
// module load 시점에 브라우저에서는 아예 PrismaClient 를 생성조차 하지 않도록 typeof window
// 로 완전 우회. 서버에서만 실제 client 생성 + eager $connect().
import "server-only";
import type { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeServerClient(): PrismaClient {
  // require() 를 브라우저 조건 밖으로 밀어 넣어 module load 시 evaluation 을 회피.
  // ESM import 는 top-level 시점에 반드시 실행되지만 require 는 지연 가능.
  // (이 파일 자체는 server-only 라 브라우저에선 실행돼선 안 되지만, 유출됐을 때의 최후 방어.)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient: RealPrismaClient } = require("@prisma/client");
  const client: PrismaClient = new RealPrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  // Eager warmup: 첫 쿼리 콜드스타트 완화. 인스턴스 라이프타임 동안 한 번만.
  void client.$connect().catch((err: unknown) => {
    console.warn("[prisma] eager $connect failed", (err as Error)?.message);
  });
  return client;
}

// 브라우저에서는 module 이 로드돼도 PrismaClient 를 생성/실행 안 함 → 460초 프리징 원천 차단.
// server 에서만 진짜 client 를 만들어 반환.
export const prisma: PrismaClient =
  typeof window === "undefined"
    ? (globalForPrisma.prisma ?? makeServerClient())
    : (new Proxy({} as PrismaClient, {
        get() {
          throw new Error("[prisma] browser access blocked. Server-only module leaked to client.");
        },
      }));

if (process.env.NODE_ENV !== "production" && typeof window === "undefined") {
  globalForPrisma.prisma = prisma;
}
