import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DATA_SANITY_LOCK_UNTIL_KEY = 'data_sanity_lock_until';
const DATA_SANITY_LOCK_REASON_KEY = 'data_sanity_lock_reason';
const DATA_SANITY_LOCK_SYMBOLS_KEY = 'data_sanity_lock_symbols';
const DATA_SANITY_LOCK_UPDATED_AT_KEY = 'data_sanity_lock_updated_at';

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function upsertConfigKey(key: string, value: string) {
  await db.query(
    `
      INSERT INTO config (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, value],
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || 'BBCA').toUpperCase();
    const lookbackMinutes = Math.min(240, Math.max(5, Number(searchParams.get('lookbackMinutes') || 30)));
    const maxJumpPct = Math.min(50, Math.max(1, Number(searchParams.get('maxJumpPct') || 25)));
    const lockMinutes = Math.min(240, Math.max(5, Number(searchParams.get('lockMinutes') || 30)));

    const lockConfigResult = await db.query(
      `
        SELECT key, value
        FROM config
        WHERE key = ANY($1::text[])
      `,
      [[
        DATA_SANITY_LOCK_UNTIL_KEY,
        DATA_SANITY_LOCK_REASON_KEY,
        DATA_SANITY_LOCK_SYMBOLS_KEY,
        DATA_SANITY_LOCK_UPDATED_AT_KEY,
      ]],
    );

    const lockConfig = new Map<string, string>();
    for (const row of lockConfigResult.rows as Array<{ key: string; value: string }>) {
      lockConfig.set(row.key, row.value);
    }

    const now = new Date();
    const lockUntil = parseDate(lockConfig.get(DATA_SANITY_LOCK_UNTIL_KEY) || null);
    const existingSymbols = (lockConfig.get(DATA_SANITY_LOCK_SYMBOLS_KEY) || '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    const lockReason = lockConfig.get(DATA_SANITY_LOCK_REASON_KEY) || null;
    const lockUpdatedAt = lockConfig.get(DATA_SANITY_LOCK_UPDATED_AT_KEY) || null;

    const result = await db.query(
      `
        SELECT id, timestamp, price::numeric AS price, volume
        FROM trades
        WHERE symbol = $1
          AND timestamp >= NOW() - ($2::text || ' minutes')::interval
        ORDER BY timestamp ASC
        LIMIT 2000
      `,
      [symbol, lookbackMinutes],
    );

    const rows = result.rows;
    if (!rows.length) {
      return NextResponse.json({
        success: true,
        symbol,
        contaminated: false,
        checked_points: 0,
        issues: [],
        reason: 'No recent trade data',
        checked_at: new Date().toISOString(),
      });
    }

    const issues: Array<{ id: string; type: 'PRICE_JUMP' | 'INVALID_VALUE'; detail: string }> = [];
    let previousPrice: number | null = null;

    for (const row of rows) {
      const price = Number(row.price || 0);
      const volume = Number(row.volume || 0);

      if (price <= 0 || volume < 0) {
        if (issues.length < 20) {
          issues.push({
            id: String(row.id),
            type: 'INVALID_VALUE',
            detail: `Invalid price/volume at ${row.timestamp}`,
          });
        }
        continue;
      }

      if (previousPrice !== null && previousPrice > 0) {
        const jumpPct = Math.abs(((price - previousPrice) / previousPrice) * 100);
        if (jumpPct > maxJumpPct) {
          if (issues.length < 20) {
            issues.push({
              id: String(row.id),
              type: 'PRICE_JUMP',
              detail: `Price jump ${jumpPct.toFixed(2)}% exceeds ${maxJumpPct}%`,
            });
          }
        }
      }

      previousPrice = price;
    }

    const contaminated = issues.length > 0;
    let lockActive = Boolean(lockUntil && lockUntil.getTime() > now.getTime());
    let lockUntilIso = lockUntil ? lockUntil.toISOString() : null;
    let lockReasonValue = lockReason;
    let lockSymbols = existingSymbols;
    let lockUpdatedAtValue = lockUpdatedAt;

    if (contaminated) {
      const nextLockUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
      lockActive = true;
      lockUntilIso = nextLockUntil.toISOString();
      lockReasonValue = `DATA CONTAMINATED: ${symbol} | ${issues[0]?.detail || 'Anomaly detected'}`;
      lockSymbols = Array.from(new Set([...existingSymbols, symbol]));
      lockUpdatedAtValue = now.toISOString();

      await Promise.all([
        upsertConfigKey(DATA_SANITY_LOCK_UNTIL_KEY, lockUntilIso),
        upsertConfigKey(DATA_SANITY_LOCK_REASON_KEY, lockReasonValue),
        upsertConfigKey(DATA_SANITY_LOCK_SYMBOLS_KEY, lockSymbols.join(',')),
        upsertConfigKey(DATA_SANITY_LOCK_UPDATED_AT_KEY, lockUpdatedAtValue),
      ]);
    } else if (!lockActive && lockUntil) {
      lockUntilIso = null;
      lockReasonValue = null;
      lockSymbols = [];
      lockUpdatedAtValue = now.toISOString();

      await Promise.all([
        upsertConfigKey(DATA_SANITY_LOCK_UNTIL_KEY, ''),
        upsertConfigKey(DATA_SANITY_LOCK_REASON_KEY, ''),
        upsertConfigKey(DATA_SANITY_LOCK_SYMBOLS_KEY, ''),
        upsertConfigKey(DATA_SANITY_LOCK_UPDATED_AT_KEY, lockUpdatedAtValue),
      ]);
    }

    return NextResponse.json({
      success: true,
      symbol,
      contaminated,
      checked_points: rows.length,
      max_jump_pct: maxJumpPct,
      lock_recommended: contaminated || lockActive,
      lock_state: {
        active: lockActive,
        lock_until: lockUntilIso,
        reason: lockReasonValue,
        symbols: lockSymbols,
        updated_at: lockUpdatedAtValue,
      },
      issues,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('data-sanity GET failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to run data sanity checks' }, { status: 500 });
  }
}
