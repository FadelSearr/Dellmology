import { NextRequest, NextResponse } from 'next/server';

// ══════════════════════════════════════════════════════════════
// /api/zeroclaw — Secure AI Orchestrator Gateway
//
// All ZeroClaw → Dellmology calls funnel through here.
// Auth: X-ZeroClaw-Key header must match ZEROCLAW_API_KEY env var.
//
// Routes:
//   POST /api/zeroclaw?action=screener
//   POST /api/zeroclaw?action=oracle
//   POST /api/zeroclaw?action=whale_check
//   POST /api/zeroclaw?action=submit_job
//   GET  /api/zeroclaw?action=daily_summary
// ══════════════════════════════════════════════════════════════

function checkAuth(request: NextRequest): boolean {
  const key = request.headers.get('X-ZeroClaw-Key');
  return key === process.env.ZEROCLAW_API_KEY;
}

function unauthorized() {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}

// ── Strict input validation ───────────────────────────────────
function validateScreenerParams(params: any): string | null {
  const validModes = ['daytrade', 'swing', 'whale', 'ai', 'watchlist'];
  if (params.mode && !validModes.includes(params.mode)) {
    return `Invalid mode. Must be one of: ${validModes.join(', ')}`;
  }
  if (params.ticker) {
    if (typeof params.ticker !== 'string' || params.ticker.length > 4) {
      return 'Ticker must be a string of max 4 characters';
    }
    if (!/^[A-Z]+$/.test(params.ticker.toUpperCase())) {
      return 'Ticker must contain only uppercase letters';
    }
  }
  if (params.minPrice !== undefined && (isNaN(params.minPrice) || params.minPrice < 0)) {
    return 'minPrice must be a non-negative number';
  }
  if (params.maxPrice !== undefined && (isNaN(params.maxPrice) || params.maxPrice > 100000)) {
    return 'maxPrice must be <= 100000';
  }
  if (params.minPrice !== undefined && params.maxPrice !== undefined && params.minPrice > params.maxPrice) {
    return 'minPrice must be <= maxPrice';
  }
  return null;
}

const base = `http://localhost:${process.env.PORT || 3000}`;

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) return unauthorized();

  const action = new URL(request.url).searchParams.get('action');

  switch (action) {
    case 'daily_summary': {
      const res = await fetch(`${base}/api/daily-summary`);
      const data = await res.json();
      return NextResponse.json(data);
    }

    case 'oracle': {
      const res = await fetch(`${base}/api/oracle`);
      const data = await res.json();
      return NextResponse.json(data);
    }

    case 'breadth': {
      const res = await fetch(`${base}/api/breadth`);
      const data = await res.json();
      return NextResponse.json(data);
    }

    default:
      return NextResponse.json(
        { success: false, error: 'Missing or invalid ?action param for GET' },
        { status: 400 }
      );
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) return unauthorized();

  const action = new URL(request.url).searchParams.get('action');

  try {
    const body = await request.json().catch(() => ({}));

    switch (action) {
      // ── Run screener synchronously ──────────────────────────
      case 'screener': {
        const validErr = validateScreenerParams(body);
        if (validErr) return NextResponse.json({ success: false, error: validErr }, { status: 400 });

        const mode     = body.mode || 'daytrade';
        const minPrice = body.minPrice || 0;
        const maxPrice = body.maxPrice || 999999;
        const res = await fetch(
          `${base}/api/screener?mode=${mode}&minPrice=${minPrice}&maxPrice=${maxPrice}`,
          { signal: AbortSignal.timeout(30_000) }
        );
        return NextResponse.json(await res.json());
      }

      // ── Check whale activity on a single emiten ─────────────
      case 'whale_check': {
        const ticker = (body.ticker || '').toString().toUpperCase().trim();
        if (!ticker || ticker.length > 4) {
          return NextResponse.json({ success: false, error: 'Invalid ticker' }, { status: 400 });
        }
        const res = await fetch(`${base}/api/screener?mode=whale&q=${ticker}`);
        const data = await res.json();
        const hit = data?.data?.results?.find((r: any) => r.code === ticker) ?? null;
        return NextResponse.json({ success: true, ticker, found: !!hit, data: hit });
      }

      // ── Submit async job (returns jobId for polling) ─────────
      case 'submit_job': {
        const res = await fetch(`${base}/api/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return NextResponse.json(await res.json());
      }

      // ── Poll job status ──────────────────────────────────────
      case 'poll_job': {
        const jobId = body.jobId;
        if (!jobId) return NextResponse.json({ success: false, error: 'Missing jobId' }, { status: 400 });
        const res = await fetch(`${base}/api/jobs?id=${jobId}`);
        return NextResponse.json(await res.json());
      }

      // ── Send Telegram alert ──────────────────────────────────
      case 'send_alert': {
        const { emitenList, urgencyLevel } = body;
        if (!Array.isArray(emitenList) || emitenList.length === 0) {
          return NextResponse.json({ success: false, error: 'emitenList must be a non-empty array' }, { status: 400 });
        }
        const res = await fetch(`${base}/api/whale-alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emitenList, urgencyLevel }),
        });
        return NextResponse.json(await res.json());
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Missing or invalid ?action param for POST' },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
