import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fallbackEmptyMeta, primaryDbMeta } from '@/lib/source-adapter';

export const dynamic = 'force-dynamic';

interface ModelConfidenceSummary {
  symbol: string | null;
  window: number;
  horizon_minutes: number;
  slippage_pct: number;
  required_signals: number;
  miss_threshold: number;
  evaluated_signals: number;
  hits: number;
  misses: number;
  pending: number;
  accuracy_pct: number;
  confidence_label: 'LOW' | 'MEDIUM' | 'HIGH';
  recalibration_required: boolean;
  warning: string | null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const symbolParam = (searchParams.get('symbol') || '').trim().toUpperCase();
    const symbol = symbolParam.length > 0 ? symbolParam : null;

    const window = clampNumber(searchParams.get('window'), 20, 10, 200);
    const horizonMinutes = clampNumber(searchParams.get('horizonMinutes'), 30, 1, 240);
    const slippagePct = clampNumber(searchParams.get('slippagePct'), 0.5, 0, 5);
    const requiredSignals = clampNumber(searchParams.get('required'), 10, 5, 50);
    const missThreshold = clampNumber(searchParams.get('missThreshold'), 7, 1, requiredSignals);

    const result = await db.query(
      `
        WITH base AS (
          SELECT id, symbol, signal, price::numeric AS price, created_at
          FROM signal_snapshots
          WHERE signal IN ('BUY', 'SELL')
            AND price IS NOT NULL
            AND ($1::text IS NULL OR symbol = $1)
          ORDER BY created_at DESC
          LIMIT $2
        ),
        evaluated AS (
          SELECT
            b.id,
            b.symbol,
            b.signal,
            b.price,
            b.created_at,
            future_snap.price AS future_price,
            CASE
              WHEN future_snap.price IS NULL THEN NULL
              WHEN b.signal = 'BUY' THEN (future_snap.price >= b.price * (1 + $3::numeric / 100.0))
              WHEN b.signal = 'SELL' THEN (future_snap.price <= b.price * (1 - $3::numeric / 100.0))
              ELSE NULL
            END AS is_hit
          FROM base b
          LEFT JOIN LATERAL (
            SELECT s2.price::numeric AS price
            FROM signal_snapshots s2
            WHERE s2.symbol = b.symbol
              AND s2.price IS NOT NULL
              AND s2.created_at >= b.created_at + ($4::text || ' minutes')::interval
            ORDER BY s2.created_at ASC
            LIMIT 1
          ) AS future_snap ON TRUE
        )
        SELECT
          COUNT(*)::int AS total_signals,
          COUNT(*) FILTER (WHERE is_hit IS NOT NULL)::int AS evaluated_signals,
          COUNT(*) FILTER (WHERE is_hit = TRUE)::int AS hits,
          COUNT(*) FILTER (WHERE is_hit = FALSE)::int AS misses
        FROM evaluated
      `,
      [symbol, window, slippagePct, horizonMinutes],
    );

    const row = result.rows[0] || {};
    const totalSignals = Number(row.total_signals || 0);
    const evaluatedSignals = Number(row.evaluated_signals || 0);
    const hits = Number(row.hits || 0);
    const misses = Number(row.misses || 0);
    const pending = Math.max(0, totalSignals - evaluatedSignals);
    const accuracyPct = evaluatedSignals > 0 ? Number(((hits / evaluatedSignals) * 100).toFixed(1)) : 0;

    const recalibrationRequired = evaluatedSignals >= requiredSignals && misses >= missThreshold;
    const confidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH' = recalibrationRequired
      ? 'LOW'
      : accuracyPct >= 70
        ? 'HIGH'
        : accuracyPct >= 50
          ? 'MEDIUM'
          : 'LOW';

    const summary: ModelConfidenceSummary = {
      symbol,
      window,
      horizon_minutes: horizonMinutes,
      slippage_pct: slippagePct,
      required_signals: requiredSignals,
      miss_threshold: missThreshold,
      evaluated_signals: evaluatedSignals,
      hits,
      misses,
      pending,
      accuracy_pct: accuracyPct,
      confidence_label: confidenceLabel,
      recalibration_required: recalibrationRequired,
      warning: recalibrationRequired ? 'AI CONFIDENCE: LOW - RE-CALIBRATION REQUIRED' : null,
    };

    return NextResponse.json({
      ...summary,
      data_source: primaryDbMeta(),
    });
  } catch (error) {
    console.error('model-confidence GET failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to compute model confidence',
        data_source: fallbackEmptyMeta('Model confidence query failed'),
      },
      { status: 500 },
    );
  }
}

function clampNumber(
  rawValue: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}
