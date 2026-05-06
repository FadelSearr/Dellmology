/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — API Rate-Limit Middleware

   Per roadmap: "Rate-Limit menjaga agar aplikasi kamu tidak
   di-banned oleh pihak ketiga karena terlalu sering me-request data."

   In-memory sliding-window rate limiter.
   Default: 60 req / 60s per IP. Expensive endpoints use lower limits.
   ══════════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/**
 * Check rate limit for a request.
 * Returns null if allowed, or a 429 NextResponse if blocked.
 *
 * @param request  - The incoming NextRequest
 * @param limit    - Max requests per window (default 60)
 * @param windowSec - Window duration in seconds (default 60)
 */
export function rateLimit(
  request: NextRequest,
  limit = 60,
  windowSec = 60
): NextResponse | null {
  cleanup();

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  const key = `${ip}:${request.nextUrl.pathname}`;
  const now = Date.now();
  const windowMs = windowSec * 1000;

  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded',
        retry_after: retryAfter,
        limit,
        window: windowSec,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
        },
      }
    );
  }

  return null; // Allowed
}
