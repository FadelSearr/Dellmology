import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DEFAULT_CONFIG = {
  ihsg_risk_trigger_pct: -1.5,
  ups_min_normal: 70,
  ups_min_risk: 90,
  participation_cap_normal_pct: 0.01,
  participation_cap_risk_pct: 0.005,
  systemic_risk_beta_threshold: 1.5,
  risk_audit_stale_hours: 24,
  cooling_off_drawdown_pct: 5,
  cooling_off_hours: 24,
  cooling_off_required_breaches: 2,
  roc_threshold_pct: -5,
  roc_haki_ratio: 0.6,
  roc_min_trades: 5,
  confidence_window: 20,
  confidence_required_signals: 10,
  confidence_miss_threshold: 7,
  confidence_horizon_minutes: 30,
  confidence_slippage_pct: 0.5,
  failed_queue_alert_threshold: 3,
} as const;

type ConfigKey = keyof typeof DEFAULT_CONFIG;

const CONFIG_CONSTRAINTS: Record<ConfigKey, { min: number; max: number }> = {
  ihsg_risk_trigger_pct: { min: -20, max: 0 },
  ups_min_normal: { min: 1, max: 100 },
  ups_min_risk: { min: 1, max: 100 },
  participation_cap_normal_pct: { min: 0.001, max: 0.2 },
  participation_cap_risk_pct: { min: 0.001, max: 0.2 },
  systemic_risk_beta_threshold: { min: 0.1, max: 10 },
  risk_audit_stale_hours: { min: 1, max: 168 },
  cooling_off_drawdown_pct: { min: 0.1, max: 50 },
  cooling_off_hours: { min: 1, max: 168 },
  cooling_off_required_breaches: { min: 1, max: 10 },
  roc_threshold_pct: { min: -30, max: 0 },
  roc_haki_ratio: { min: 0, max: 1 },
  roc_min_trades: { min: 1, max: 500 },
  confidence_window: { min: 1, max: 200 },
  confidence_required_signals: { min: 1, max: 500 },
  confidence_miss_threshold: { min: 1, max: 500 },
  confidence_horizon_minutes: { min: 1, max: 1440 },
  confidence_slippage_pct: { min: 0, max: 20 },
  failed_queue_alert_threshold: { min: 1, max: 50 },
};

export async function GET() {
  try {
    await ensureConfigTable();

    const result = await db.query(
      `
        SELECT key, value, updated_at
        FROM system_runtime_config
        WHERE key = ANY($1::text[])
      `,
      [Object.keys(DEFAULT_CONFIG)],
    );

    const merged: Record<string, number> = { ...DEFAULT_CONFIG };
    const updatedAtByKey: Record<string, string> = {};
    for (const row of result.rows as Array<{ key: string; value: string; updated_at: string }>) {
      const key = row.key as ConfigKey;
      if (!(key in DEFAULT_CONFIG)) {
        continue;
      }
      const parsed = Number(row.value);
      if (Number.isFinite(parsed)) {
        merged[key] = parsed;
      }
      updatedAtByKey[key] = row.updated_at;
    }

    return NextResponse.json({
      config: merged,
      constraints: CONFIG_CONSTRAINTS,
      updated: updatedAtByKey,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('risk-config GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch risk config' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let client;
  try {
    const body = (await request.json()) as Partial<Record<ConfigKey, number>>;
    await ensureConfigTable();
    await ensureConfigAuditTable();

    const chain = await verifyRuntimeConfigAuditChain();
    if (!chain.valid) {
      return NextResponse.json(
        {
          error: 'Runtime config audit chain broken; updates locked',
          lock: true,
          hash_mismatches: chain.hashMismatches,
          linkage_mismatches: chain.linkageMismatches,
          checked_rows: chain.checkedRows,
        },
        { status: 423 },
      );
    }

    const entries = Object.entries(body).filter(([key]) => key in DEFAULT_CONFIG) as Array<[ConfigKey, number]>;

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No valid config key provided' }, { status: 400 });
    }

    for (const [key, value] of entries) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json({ error: `Invalid numeric value for ${key}` }, { status: 400 });
      }
      const limits = CONFIG_CONSTRAINTS[key];
      if (parsed < limits.min || parsed > limits.max) {
        return NextResponse.json(
          {
            error: `Out of range for ${key}`,
            key,
            min: limits.min,
            max: limits.max,
            received: parsed,
          },
          { status: 400 },
        );
      }
    }

    client = await db.connect();
    await client.query('BEGIN');

    const actorHeader = request.headers.get('x-operator-id') || request.headers.get('x-user-id') || 'dashboard';
    const sourceHeader = request.headers.get('x-config-source') || 'risk-config-api';
    const changed: Array<{ key: ConfigKey; oldValue: string | null; newValue: string }> = [];

    for (const [key, value] of entries) {
      const newValue = String(Number(value));
      const before = await client.query(
        `
          SELECT value
          FROM system_runtime_config
          WHERE key = $1
          LIMIT 1
        `,
        [key],
      );

      const oldValue = before.rows[0]?.value ?? null;

      await client.query(
        `
          INSERT INTO system_runtime_config (key, value)
          VALUES ($1, $2)
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `,
        [key, newValue],
      );

      if (oldValue !== newValue) {
        changed.push({ key, oldValue, newValue });
      }
    }

    if (changed.length > 0) {
      const previous = await client.query(
        `
          SELECT record_hash
          FROM runtime_config_audit
          ORDER BY id DESC
          LIMIT 1
        `,
      );

      let previousHash = previous.rows[0]?.record_hash || null;

      for (const item of changed) {
        const payload = {
          key: item.key,
          old_value: item.oldValue,
          new_value: item.newValue,
          actor: actorHeader,
          source: sourceHeader,
          changed_at: new Date().toISOString(),
        };

        const payloadHash = sha256(stableStringify(payload));
        const recordHash = sha256([
          previousHash || 'GENESIS',
          item.key,
          item.oldValue ?? 'NULL',
          item.newValue,
          actorHeader,
          sourceHeader,
          payloadHash,
        ].join('|'));

        await client.query(
          `
            INSERT INTO runtime_config_audit (
              config_key,
              old_value,
              new_value,
              actor,
              source,
              payload_hash,
              previous_hash,
              record_hash,
              hash_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
          `,
          [
            item.key,
            item.oldValue,
            item.newValue,
            actorHeader,
            sourceHeader,
            payloadHash,
            previousHash,
            recordHash,
          ],
        );

        previousHash = recordHash;
      }
    }

    await client.query('COMMIT');

    const response = await GET();
    const json = (await response.json()) as Record<string, unknown>;
    return NextResponse.json({
      ...json,
      changed_count: changed.length,
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // noop
      }
    }
    console.error('risk-config POST failed:', error);
    return NextResponse.json({ error: 'Failed to update risk config' }, { status: 500 });
  } finally {
    if (client) {
      client.release();
    }
  }
}

async function ensureConfigTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS system_runtime_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureConfigAuditTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS runtime_config_audit (
      id BIGSERIAL PRIMARY KEY,
      config_key TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT NOT NULL,
      actor TEXT,
      source TEXT,
      payload_hash TEXT,
      previous_hash TEXT,
      record_hash TEXT NOT NULL,
      hash_version SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_runtime_config_audit_key_time
      ON runtime_config_audit (config_key, created_at DESC)
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_config_audit_record_hash
      ON runtime_config_audit (record_hash)
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

async function verifyRuntimeConfigAuditChain(limit = 1000): Promise<{
  valid: boolean;
  checkedRows: number;
  hashMismatches: number;
  linkageMismatches: number;
}> {
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

  for (const row of result.rows as Array<{
    id: number;
    config_key: string;
    old_value: string | null;
    new_value: string;
    actor: string | null;
    source: string | null;
    payload_hash: string | null;
    previous_hash: string | null;
    record_hash: string;
  }>) {
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
    valid: hashMismatches === 0 && linkageMismatches === 0,
    checkedRows: result.rows.length,
    hashMismatches,
    linkageMismatches,
  };
}
