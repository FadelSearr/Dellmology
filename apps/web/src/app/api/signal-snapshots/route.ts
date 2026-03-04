import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface SignalSnapshotPayload {
  symbol: string;
  timeframe: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  price?: number;
  unified_power_score?: number;
  payload: Record<string, unknown>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 20)));
    const symbol = searchParams.get('symbol')?.trim().toUpperCase();
    const timeframe = searchParams.get('timeframe')?.trim();
    const signal = searchParams.get('signal')?.trim().toUpperCase();
    const ruleEngineMode = searchParams.get('rule_engine_mode')?.trim().toUpperCase();
    const ruleEngineVersion = searchParams.get('rule_engine_version')?.trim();
    const configDrift = parseBooleanQuery(searchParams.get('config_drift'));

    await ensureSignalSnapshotsTable();

    const whereClauses: string[] = [];
    const values: Array<string | number | boolean> = [];

    if (symbol) {
      values.push(symbol);
      whereClauses.push(`symbol = $${values.length}`);
    }

    if (timeframe) {
      values.push(timeframe);
      whereClauses.push(`timeframe = $${values.length}`);
    }

    if (signal) {
      values.push(signal);
      whereClauses.push(`signal = $${values.length}`);
    }

    if (ruleEngineMode) {
      values.push(ruleEngineMode);
      whereClauses.push(`COALESCE(payload->'snapshot_context'->'rule_engine'->>'mode', payload->'rule_engine_versioning'->>'mode') = $${values.length}`);
    }

    if (ruleEngineVersion) {
      values.push(ruleEngineVersion);
      whereClauses.push(`COALESCE(payload->'snapshot_context'->'rule_engine'->>'version', payload->'rule_engine_versioning'->>'version') = $${values.length}`);
    }

    if (typeof configDrift === 'boolean') {
      values.push(configDrift);
      whereClauses.push(`COALESCE((payload->'snapshot_context'->'rule_engine'->>'config_drift')::boolean, (payload->'rule_engine_versioning'->>'config_drift')::boolean) = $${values.length}`);
    }

    values.push(limit);
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const result = await db.query(
      `
        SELECT id, symbol, timeframe, signal, price, unified_power_score, payload, payload_hash, previous_hash, record_hash, hash_version, created_at
        FROM signal_snapshots
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${values.length}
      `,
      values,
    );

    return NextResponse.json({
      snapshots: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('signal-snapshots GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch signal snapshots' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignalSnapshotPayload;

    if (!body?.symbol || !body?.timeframe || !body?.signal || !body?.payload) {
      return NextResponse.json({ error: 'Missing required snapshot fields' }, { status: 400 });
    }

    await ensureSignalSnapshotsTable();

    const previous = await db.query(
      `
        SELECT record_hash
        FROM signal_snapshots
        ORDER BY id DESC
        LIMIT 1
      `,
    );

    const previousHash = previous.rows[0]?.record_hash || null;
    const payloadDigest = sha256(stableStringify(body.payload));
    const recordHash = sha256(
      [
        previousHash || 'GENESIS',
        body.symbol.toUpperCase(),
        body.timeframe,
        body.signal,
        body.price ?? 'NULL',
        body.unified_power_score ?? 'NULL',
        payloadDigest,
      ].join('|'),
    );

    const inserted = await db.query(
      `
        INSERT INTO signal_snapshots (
          symbol,
          timeframe,
          signal,
          price,
          unified_power_score,
          payload,
          payload_hash,
          previous_hash,
          record_hash,
          hash_version
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, 2)
        RETURNING id, created_at, payload_hash, previous_hash, record_hash, hash_version
      `,
      [
        body.symbol.toUpperCase(),
        body.timeframe,
        body.signal,
        body.price ?? null,
        body.unified_power_score ?? null,
        JSON.stringify(body.payload),
        payloadDigest,
        previousHash,
        recordHash,
      ],
    );

    return NextResponse.json({
      success: true,
      snapshot_id: inserted.rows[0]?.id,
      created_at: inserted.rows[0]?.created_at,
      payload_hash: inserted.rows[0]?.payload_hash,
      previous_hash: inserted.rows[0]?.previous_hash,
      record_hash: inserted.rows[0]?.record_hash,
      hash_version: inserted.rows[0]?.hash_version,
    });
  } catch (error) {
    console.error('signal-snapshots POST failed:', error);
    return NextResponse.json({ error: 'Failed to save signal snapshot' }, { status: 500 });
  }
}

async function ensureSignalSnapshotsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS signal_snapshots (
      id BIGSERIAL PRIMARY KEY,
      symbol VARCHAR(16) NOT NULL,
      timeframe VARCHAR(16) NOT NULL,
      signal VARCHAR(16) NOT NULL,
      price NUMERIC,
      unified_power_score INTEGER,
      payload JSONB NOT NULL,
      payload_hash TEXT,
      previous_hash TEXT,
      record_hash TEXT,
      hash_version SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE signal_snapshots
    ADD COLUMN IF NOT EXISTS payload_hash TEXT
  `);

  await db.query(`
    ALTER TABLE signal_snapshots
    ADD COLUMN IF NOT EXISTS previous_hash TEXT
  `);

  await db.query(`
    ALTER TABLE signal_snapshots
    ADD COLUMN IF NOT EXISTS record_hash TEXT
  `);

  await db.query(`
    ALTER TABLE signal_snapshots
    ADD COLUMN IF NOT EXISTS hash_version SMALLINT NOT NULL DEFAULT 1
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_signal_snapshots_symbol_time
      ON signal_snapshots (symbol, created_at DESC)
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_snapshots_record_hash
      ON signal_snapshots (record_hash)
      WHERE record_hash IS NOT NULL
  `);
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

function parseBooleanQuery(value: string | null): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
}
