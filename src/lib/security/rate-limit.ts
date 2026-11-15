// In-memory sliding-window rate limiter.
//
// 한계: 단일 프로세스 메모리 기반 → serverless 다중 인스턴스에선 완벽하지 않음.
// 개인 사용 규모에선 사실상 단일 인스턴스가 대부분 트래픽을 처리하므로 충분.
// 완전 분산 필요 시 Upstash/Redis 로 교체.
//
// 사용법 (middleware 안):
//   const rl = takeRateLimit({ key: `login:${ip}`, limit: 5, windowMs: 60_000 });
//   if (!rl.allowed) return NextResponse.json({ error: "..." }, { status: 429 });

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// 주기적으로 만료 bucket 정리 — 첫 접근 시 lazy sweep.
let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweepExpired(now: number) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  key: string;      // 예: "auth:1.2.3.4"
  limit: number;    // window 안 최대 요청 수
  windowMs: number; // 시간 창 (ms)
}

export function takeRateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const existing = buckets.get(opts.key);
  if (!existing || existing.resetAt <= now) {
    // 새 창 시작
    const resetAt = now + opts.windowMs;
    buckets.set(opts.key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: opts.limit - 1,
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  if (existing.count >= opts.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: opts.limit - existing.count,
    resetAt: existing.resetAt,
    retryAfterSeconds: 0,
  };
}

// 클라이언트 IP 추출 (Vercel/proxy 대응).
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
