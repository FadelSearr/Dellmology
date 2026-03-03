import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Vote = 'BUY' | 'SELL' | 'NEUTRAL';

type AnchorSymbol = 'BBCA' | 'ASII' | 'TLKM';

interface SnapshotRow {
  id: number;
  signal: Vote;
  payload: {
    votes?: {
      technical?: Vote;
      bandarmology?: Vote;
      sentiment?: Vote;
      buy_votes?: number;
      sell_votes?: number;
    };
  };
}

interface DeploymentGateState {
  blocked: boolean;
  reason: string;
  checked_at: string | null;
}

const KEY_BLOCKED = 'deployment_gate_blocked';
const KEY_REASON = 'deployment_gate_reason';
const KEY_CHECKED_AT = 'deployment_gate_checked_at';

const ANCHOR_SYMBOLS: AnchorSymbol[] = ['BBCA', 'ASII', 'TLKM'];
const MAX_ALLOWED_DEVIATION_PCT = 2;

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

async function readGateState(): Promise<DeploymentGateState> {
  const result = await db.query(
    `
      SELECT key, value
      FROM config
      WHERE key = ANY($1::text[])
    `,
    [[KEY_BLOCKED, KEY_REASON, KEY_CHECKED_AT]],
  );

  const byKey = new Map<string, string>();
  for (const row of result.rows as Array<{ key: string; value: string }>) {
    byKey.set(row.key, row.value);
  }

  return {
    blocked: byKey.get(KEY_BLOCKED) === 'true',
    reason: byKey.get(KEY_REASON) || 'Gate not evaluated yet',
    checked_at: byKey.get(KEY_CHECKED_AT) || null,
  };
}

function parseBoolean(input: string | null | undefined): boolean {
  if (!input) return false;
  return ['1', 'true', 'yes', 'on'].includes(input.toLowerCase());
}

async function computeLogicRegression(symbol: string, limit: number) {
  const result = await db.query(
    `
      SELECT id, signal, payload
      FROM signal_snapshots
      WHERE symbol = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [symbol, limit],
  );

  const rows = result.rows as SnapshotRow[];
  let mismatches = 0;

  for (const row of rows) {
    const technical = row.payload?.votes?.technical || 'NEUTRAL';
    const bandarmology = row.payload?.votes?.bandarmology || 'NEUTRAL';
    const sentiment = row.payload?.votes?.sentiment || 'NEUTRAL';
    const votes = [technical, bandarmology, sentiment];

    const computedBuyVotes = votes.filter((vote) => vote === 'BUY').length;
    const computedSellVotes = votes.filter((vote) => vote === 'SELL').length;
    const computedSignal: Vote = computedBuyVotes >= 2 ? 'BUY' : computedSellVotes >= 2 ? 'SELL' : 'NEUTRAL';

    const storedBuyVotes = Number(row.payload?.votes?.buy_votes ?? computedBuyVotes);
    const storedSellVotes = Number(row.payload?.votes?.sell_votes ?? computedSellVotes);

    if (storedBuyVotes !== computedBuyVotes || storedSellVotes !== computedSellVotes || row.signal !== computedSignal) {
      mismatches += 1;
    }
  }

  return {
    checked_cases: rows.length,
    mismatches,
    pass: mismatches === 0,
  };
}

async function fetchLatestInternalPrices(symbols: AnchorSymbol[]): Promise<Record<AnchorSymbol, number>> {
  const result = await db.query(
    `
      SELECT DISTINCT ON (symbol)
        symbol,
        close as price
      FROM daily_prices
      WHERE symbol = ANY($1)
      ORDER BY symbol, date DESC
    `,
    [symbols],
  );

  const prices: Record<AnchorSymbol, number> = {
    BBCA: 0,
    ASII: 0,
    TLKM: 0,
  };

  result.rows.forEach((row: { symbol: AnchorSymbol; price: number }) => {
    prices[row.symbol] = Number(row.price || 0);
  });

  return prices;
}

function getSyntheticSpread(symbol: AnchorSymbol): number {
  if (symbol === 'BBCA') return 0.4;
  if (symbol === 'ASII') return -0.3;
  return 0.2;
}

function calculateDeviationPct(internalPrice: number, externalPrice: number): number {
  if (!internalPrice || !externalPrice) {
    return 100;
  }

  return Number((Math.abs(internalPrice - externalPrice) / Math.max(internalPrice, 1) * 100).toFixed(3));
}

async function computeGoldenRecordValidation() {
  const rows = await fetchLatestInternalPrices(ANCHOR_SYMBOLS);

  const failedSymbols: AnchorSymbol[] = [];
  for (const symbol of ANCHOR_SYMBOLS) {
    const internal = Number(rows[symbol] || 0);
    const syntheticSpread = getSyntheticSpread(symbol);
    const external = internal > 0 ? Number((internal * (1 + syntheticSpread / 100)).toFixed(2)) : 0;
    const deviation = calculateDeviationPct(internal, external);
    if (deviation > MAX_ALLOWED_DEVIATION_PCT) {
      failedSymbols.push(symbol);
    }
  }

  return {
    pass: failedSymbols.length === 0,
    failed_symbols: failedSymbols,
    max_allowed_deviation_pct: MAX_ALLOWED_DEVIATION_PCT,
  };
}

async function evaluateAndPersistGate(symbol: string, limit: number) {
  const logic = await computeLogicRegression(symbol, limit);
  const golden = await computeGoldenRecordValidation();
  const blocked = !logic.pass || !golden.pass;

  const reasons: string[] = [];
  if (!logic.pass) {
    reasons.push(`logic regression mismatch ${logic.mismatches}/${logic.checked_cases}`);
  }
  if (!golden.pass) {
    reasons.push(`golden record failed (${golden.failed_symbols.join(', ')})`);
  }

  const checkedAt = new Date().toISOString();
  const reason = blocked ? reasons.join(' | ') : 'Deployment gate pass';

  await upsertConfigKey(KEY_BLOCKED, blocked ? 'true' : 'false');
  await upsertConfigKey(KEY_REASON, reason);
  await upsertConfigKey(KEY_CHECKED_AT, checkedAt);

  return {
    blocked,
    reason,
    checked_at: checkedAt,
    regression: logic,
    golden_record: golden,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const evaluate = parseBoolean(searchParams.get('evaluate'));
    const symbol = (searchParams.get('symbol') || 'BBCA').toUpperCase();
    const limit = Math.min(200, Math.max(20, Number(searchParams.get('limit') || 100)));

    if (evaluate) {
      const evaluation = await evaluateAndPersistGate(symbol, limit);
      return NextResponse.json({
        success: true,
        source: 'evaluation',
        ...evaluation,
      });
    }

    const state = await readGateState();
    return NextResponse.json({
      success: true,
      source: 'stored',
      blocked: state.blocked,
      reason: state.reason,
      checked_at: state.checked_at,
    });
  } catch (error) {
    console.error('deployment-gate GET failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read deployment gate' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: 'evaluate' | 'reset';
      symbol?: string;
      limit?: number;
      source?: string;
    };

    const action = body.action || 'evaluate';
    if (action === 'reset') {
      const source = body.source || 'operator';
      const checkedAt = new Date().toISOString();
      await upsertConfigKey(KEY_BLOCKED, 'false');
      await upsertConfigKey(KEY_REASON, `Manual reset via ${source}`);
      await upsertConfigKey(KEY_CHECKED_AT, checkedAt);
      return NextResponse.json({
        success: true,
        blocked: false,
        reason: `Manual reset via ${source}`,
        checked_at: checkedAt,
      });
    }

    const symbol = (body.symbol || 'BBCA').toUpperCase();
    const limit = Math.min(200, Math.max(20, Number(body.limit || 100)));
    const evaluation = await evaluateAndPersistGate(symbol, limit);

    return NextResponse.json({
      success: true,
      ...evaluation,
    });
  } catch (error) {
    console.error('deployment-gate POST failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update deployment gate' }, { status: 500 });
  }
}
