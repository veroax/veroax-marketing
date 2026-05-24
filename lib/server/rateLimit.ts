// Per-IP token bucket. Process-local; resets on cold start. Good
// enough to stop dumb scripted spam without adding a DB or edge KV.
// If the deployment scales horizontally, this becomes per-instance,
// which is acceptable for the low-traffic surfaces that use it
// (contact forms, error submissions, public PDF render).
//
// Usage:
//   const limit = rateLimit({ key: ip, scope: "contact", max: 5, windowMs: 60_000 });
//   if (!limit.allowed) return NextResponse.json({ error: "Too many." }, { status: 429 });

const BUCKETS = new Map<string, number[]>();

export type RateLimitInput = {
  /** The thing being rate-limited (typically the client IP). */
  key: string;
  /** Distinguishes counters for different routes against the same IP. */
  scope: string;
  /** Max requests allowed inside the rolling window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Hits within the current window after this request was considered. */
  count: number;
  /** Configured cap. */
  limit: number;
  /** Seconds until the oldest entry in the window expires. */
  retryAfterSec: number;
};

export function rateLimit(input: RateLimitInput): RateLimitResult {
  const bucketKey = `${input.scope}:${input.key}`;
  const now = Date.now();
  const cutoff = now - input.windowMs;

  const existing = (BUCKETS.get(bucketKey) ?? []).filter((t) => t > cutoff);
  if (existing.length >= input.max) {
    const oldest = existing[0] ?? now;
    const retryAfterMs = Math.max(0, oldest + input.windowMs - now);
    BUCKETS.set(bucketKey, existing);
    return {
      allowed: false,
      count: existing.length,
      limit: input.max,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
    };
  }
  existing.push(now);
  BUCKETS.set(bucketKey, existing);
  return {
    allowed: true,
    count: existing.length,
    limit: input.max,
    retryAfterSec: 0,
  };
}

/** Extract a client IP from the incoming request headers. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
