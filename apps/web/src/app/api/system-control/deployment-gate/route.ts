import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { verifyRuntimeConfigAuditChain } from '@/lib/security/immutableAudit';
import { buildImmutableAuditLockPayload } from '@/lib/security/lockPayloads';

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

interface RuntimeConfigAuditRow {
  id: number;
  config_key: string;
  old_value: string | null;
  new_value: string;
  actor: string | null;
  source: string | null;
  payload_hash: string | null;
  previous_hash: string | null;
  record_hash: string;
}

interface SignalSnapshotAuditRow {
  id: number;
  symbol: string;
  timeframe: string;
  signal: Vote;
  price: string | number | null;
  unified_power_score: number | null;
  payload: unknown;
  payload_hash: string | null;
  previous_hash: string | null;
  record_hash: string | null;
  hash_version: number | null;
}

const KEY_BLOCKED = 'deployment_gate_blocked';
const KEY_REASON = 'deployment_gate_reason';
const KEY_CHECKED_AT = 'deployment_gate_checked_at';

const ANCHOR_SYMBOLS: AnchorSymbol[] = ['BBCA', 'ASII', 'TLKM'];
const MAX_ALLOWED_DEVIATION_PCT = 2;
const IMMUTABLE_AUDIT_MAX_ROWS = 500;

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

async function fetchYahooAnchorPrices(symbols: AnchorSymbol[]): Promise<Record<AnchorSymbol, number>> {
  const prices: Record<AnchorSymbol, number> = {
    BBCA: 0,
    ASII: 0,
    TLKM: 0,
  };

  const yahooSymbols = symbols.map((symbol) => `${symbol}.JK`).join(',');
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbols)}`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      return prices;
    }

    const body = (await response.json()) as {
      quoteResponse?: {
        result?: Array<{
          symbol?: string;
          regularMarketPrice?: number;
        }>;
      };
    };

    for (const row of body?.quoteResponse?.result || []) {
      const rawSymbol = String(row.symbol || '').toUpperCase();
      const normalized = rawSymbol.replace('.JK', '') as AnchorSymbol;
      if (symbols.includes(normalized)) {
        prices[normalized] = Number(row.regularMarketPrice || 0);
      }
    }
  } catch {
    return prices;
  }

  return prices;
}

function calculateDeviationPct(internalPrice: number, externalPrice: number): number {
  if (!internalPrice || !externalPrice) {
    return 100;
  }

  return Number((Math.abs(internalPrice - externalPrice) / Math.max(internalPrice, 1) * 100).toFixed(3));
}

async function computeGoldenRecordValidation() {
  const [rows, externalPrices] = await Promise.all([
    fetchLatestInternalPrices(ANCHOR_SYMBOLS),
    fetchYahooAnchorPrices(ANCHOR_SYMBOLS),
  ]);

  const failedSymbols: AnchorSymbol[] = [];
  for (const symbol of ANCHOR_SYMBOLS) {
    const internal = Number(rows[symbol] || 0);
    const external = Number(externalPrices[symbol] || 0);
    if (external <= 0) {
      failedSymbols.push(symbol);
      continue;
    }
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
  const [logic, golden, immutableAudit] = await Promise.all([
    computeLogicRegression(symbol, limit),
    computeGoldenRecordValidation(),
    computeImmutableAuditValidation(IMMUTABLE_AUDIT_MAX_ROWS),
  ]);
  const blocked = !logic.pass || !golden.pass || !immutableAudit.pass;

  const reasons: string[] = [];
  if (!logic.pass) {
    reasons.push(`logic regression mismatch ${logic.mismatches}/${logic.checked_cases}`);
  }
  if (!golden.pass) {
    reasons.push(`golden record failed (${golden.failed_symbols.join(', ')})`);
  }
  if (!immutableAudit.pass) {
    reasons.push(
      `immutable audit failed (cfg h:${immutableAudit.runtime_config.hash_mismatches} l:${immutableAudit.runtime_config.linkage_mismatches}; snap h:${immutableAudit.signal_snapshots.hash_mismatches} l:${immutableAudit.signal_snapshots.linkage_mismatches})`,
    );
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
    immutable_audit: immutableAudit,
  };
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await db.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [tableName]);
  return result.rows[0]?.exists === true;
}

async function computeImmutableAuditValidation(limit: number) {
  const [runtimeConfig, signalSnapshots] = await Promise.all([
    verifyRuntimeConfigAuditIntegrity(limit),
    verifySignalSnapshotAuditIntegrity(limit),
  ]);

  return {
    pass: runtimeConfig.pass && signalSnapshots.pass,
    checked_at: new Date().toISOString(),
    runtime_config: runtimeConfig,
    signal_snapshots: signalSnapshots,
  };
}

async function verifyRuntimeConfigAuditIntegrity(limit: number) {
  const exists = await tableExists('runtime_config_audit');
  if (!exists) {
    return {
      pass: false,
      checked_rows: 0,
      hash_mismatches: 1,
      linkage_mismatches: 1,
      table_present: false,
    };
  }

  const result = await db.query(
    `
      SELECT id, config_key, old_value, new_value, actor, source, payload_hash, previous_hash, record_hash
      FROM runtime_config_audit
      ORDER BY id ASC
      LIMIT $1
    `,
    [limit],
  );

  let previousRecordHash: string | null = null;
  let hashMismatches = 0;
  let linkageMismatches = 0;

  for (const row of result.rows as RuntimeConfigAuditRow[]) {
    const expectedRecordHash = sha256(
      [
        row.previous_hash || 'GENESIS',
        row.config_key,
        row.old_value ?? 'NULL',
        row.new_value,
        row.actor || '',
        row.source || '',
        row.payload_hash || '',
      ].join('|'),
    );

    if (expectedRecordHash !== row.record_hash) {
      hashMismatches += 1;
    }

    if (row.previous_hash !== (previousRecordHash || null)) {
      linkageMismatches += 1;
    }

    previousRecordHash = row.record_hash;
  }

  return {
    pass: hashMismatches === 0 && linkageMismatches === 0,
    checked_rows: result.rows.length,
    hash_mismatches: hashMismatches,
    linkage_mismatches: linkageMismatches,
    table_present: true,
  };
}

async function verifySignalSnapshotAuditIntegrity(limit: number) {
  const exists = await tableExists('signal_snapshots');
  if (!exists) {
    return {
      pass: false,
      checked_rows: 0,
      hash_mismatches: 1,
      linkage_mismatches: 1,
      upgraded_rows: 0,
      table_present: false,
    };
  }

  const result = await db.query(
    `
      SELECT id, symbol, timeframe, signal, price, unified_power_score, payload, payload_hash, previous_hash, record_hash, hash_version
      FROM signal_snapshots
      ORDER BY id ASC
      LIMIT $1
    `,
    [limit],
  );

  let previousRecordHash: string | null = null;
  let linkageMismatches = 0;
  let hashMismatches = 0;
  let upgradedRows = 0;

  for (const row of result.rows as SignalSnapshotAuditRow[]) {
    if (row.previous_hash !== (previousRecordHash || null)) {
      linkageMismatches += 1;
    }

    const hashVersion = Number(row.hash_version || 1);
    if (hashVersion >= 2) {
      upgradedRows += 1;
      const expectedPayloadHash = sha256(stableStringify(row.payload));
      const expectedRecordHash = sha256(
        [
          row.previous_hash || 'GENESIS',
          row.symbol,
          row.timeframe,
          row.signal,
          row.price ?? 'NULL',
          row.unified_power_score ?? 'NULL',
          expectedPayloadHash,
        ].join('|'),
      );

      if ((row.payload_hash || '') !== expectedPayloadHash || (row.record_hash || '') !== expectedRecordHash) {
        hashMismatches += 1;
      }
    }

    previousRecordHash = row.record_hash || null;
  }

  return {
    pass: hashMismatches === 0 && linkageMismatches === 0,
    checked_rows: result.rows.length,
    hash_mismatches: hashMismatches,
    linkage_mismatches: linkageMismatches,
    upgraded_rows: upgradedRows,
    table_present: true,
  };
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`).join(',')}}`;
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
    const immutableAudit = await verifyRuntimeConfigAuditChain();
    if (!immutableAudit.valid) {
      return NextResponse.json(buildImmutableAuditLockPayload(immutableAudit), { status: 423 });
    }

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
