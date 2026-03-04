import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
const AUDIT_ALERT_COOLDOWN_MS = Math.min(
  60 * 60 * 1000,
  Math.max(30 * 1000, Number(process.env.IMMUTABLE_AUDIT_ALERT_COOLDOWN_MS || 10 * 60 * 1000)),
);

interface AuditRow {
  id: number;
  config_key: string;
  old_value: string | null;
  new_value: string;
  actor: string | null;
  source: string | null;
  payload_hash: string | null;
  previous_hash: string | null;
  record_hash: string;
  created_at: string;
}

interface LockEventRow {
  id: number;
  chain_key: string;
  event_type: 'LOCK' | 'UNLOCK';
  checked_rows: number;
  hash_mismatches: number;
  linkage_mismatches: number;
  note: string | null;
  created_at: string;
}

interface TransitionAlertResult {
  enabled: boolean;
  allowed: boolean;
  event_type: 'LOCK' | 'UNLOCK';
  chain_key: string;
  cooldown_ms: number;
  remaining_ms: number;
  dispatched: boolean;
  dispatch_error: string | null;
  checked_at: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key')?.trim() || null;
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') || 200)));

    await ensureConfigAuditTable();
    await ensureConfigChainStateTables();

    const query = key
      ? `
        SELECT id, config_key, old_value, new_value, actor, source, payload_hash, previous_hash, record_hash, created_at
        FROM runtime_config_audit
        WHERE config_key = $1
        ORDER BY id ASC
        LIMIT $2
      `
      : `
        SELECT id, config_key, old_value, new_value, actor, source, payload_hash, previous_hash, record_hash, created_at
        FROM runtime_config_audit
        ORDER BY id ASC
        LIMIT $1
      `;

    const result = key ? await db.query(query, [key, limit]) : await db.query(query, [limit]);
    const rows = result.rows as AuditRow[];

    let previousRecordHash: string | null = null;
    let hashMismatches = 0;
    let linkageMismatches = 0;
    const failures: Array<{ id: number; reason: 'HASH_MISMATCH' | 'LINKAGE_MISMATCH' }> = [];

    for (const row of rows) {
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
        failures.push({ id: row.id, reason: 'HASH_MISMATCH' });
      }

      if (row.previous_hash !== (previousRecordHash || null)) {
        linkageMismatches += 1;
        failures.push({ id: row.id, reason: 'LINKAGE_MISMATCH' });
      }

      previousRecordHash = row.record_hash;
    }

    const valid = hashMismatches === 0 && linkageMismatches === 0;

    const chainKey = key || '__GLOBAL__';
    const stateResult = await db.query(
      `
        SELECT is_valid
        FROM runtime_config_chain_state
        WHERE chain_key = $1
        LIMIT 1
      `,
      [chainKey],
    );

    let transition: { changed: boolean; event_type: 'LOCK' | 'UNLOCK' | null } = {
      changed: false,
      event_type: null,
    };

    if (stateResult.rows.length === 0) {
      await db.query(
        `
          INSERT INTO runtime_config_chain_state (
            chain_key,
            is_valid,
            checked_rows,
            hash_mismatches,
            linkage_mismatches,
            last_verified_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        `,
        [chainKey, valid, rows.length, hashMismatches, linkageMismatches],
      );
    } else {
      const previousValid = stateResult.rows[0]?.is_valid === true;
      if (previousValid !== valid) {
        const eventType: 'LOCK' | 'UNLOCK' = valid ? 'UNLOCK' : 'LOCK';
        await db.query(
          `
            INSERT INTO runtime_config_lock_events (
              chain_key,
              event_type,
              checked_rows,
              hash_mismatches,
              linkage_mismatches,
              note
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            chainKey,
            eventType,
            rows.length,
            hashMismatches,
            linkageMismatches,
            'verify-transition',
          ],
        );
        transition = { changed: true, event_type: eventType };
      }

      await db.query(
        `
          UPDATE runtime_config_chain_state
          SET
            is_valid = $2,
            checked_rows = $3,
            hash_mismatches = $4,
            linkage_mismatches = $5,
            last_verified_at = NOW(),
            updated_at = NOW()
          WHERE chain_key = $1
        `,
        [chainKey, valid, rows.length, hashMismatches, linkageMismatches],
      );
    }

    const recentEventsResult = await db.query(
      `
        SELECT id, chain_key, event_type, checked_rows, hash_mismatches, linkage_mismatches, note, created_at
        FROM runtime_config_lock_events
        WHERE chain_key = $1
        ORDER BY id DESC
        LIMIT 5
      `,
      [chainKey],
    );

    let transitionAlert: TransitionAlertResult | null = null;
    if (transition.changed && transition.event_type) {
      transitionAlert = await emitTransitionAlert({
        chainKey,
        eventType: transition.event_type,
        checkedRows: rows.length,
        hashMismatches,
        linkageMismatches,
      });
    }

    return NextResponse.json({
      success: true,
      key,
      valid,
      checked_rows: rows.length,
      hash_mismatches: hashMismatches,
      linkage_mismatches: linkageMismatches,
      failures: failures.slice(0, 20),
      transition,
      transition_alert: transitionAlert,
      recent_events: recentEventsResult.rows as LockEventRow[],
      verified_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('risk-config audit verify GET failed:', error);
    return NextResponse.json({ error: 'Failed to verify risk-config audit chain' }, { status: 500 });
  }
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

async function ensureConfigChainStateTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS runtime_config_chain_state (
      chain_key TEXT PRIMARY KEY,
      is_valid BOOLEAN NOT NULL DEFAULT TRUE,
      checked_rows INTEGER NOT NULL DEFAULT 0,
      hash_mismatches INTEGER NOT NULL DEFAULT 0,
      linkage_mismatches INTEGER NOT NULL DEFAULT 0,
      last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE runtime_config_chain_state
    ADD COLUMN IF NOT EXISTS last_lock_alert_at TIMESTAMPTZ
  `);

  await db.query(`
    ALTER TABLE runtime_config_chain_state
    ADD COLUMN IF NOT EXISTS last_unlock_alert_at TIMESTAMPTZ
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS runtime_config_lock_events (
      id BIGSERIAL PRIMARY KEY,
      chain_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      checked_rows INTEGER NOT NULL DEFAULT 0,
      hash_mismatches INTEGER NOT NULL DEFAULT 0,
      linkage_mismatches INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_runtime_config_lock_events_key_time
      ON runtime_config_lock_events (chain_key, created_at DESC)
  `);
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function emitTransitionAlert({
  chainKey,
  eventType,
  checkedRows,
  hashMismatches,
  linkageMismatches,
}: {
  chainKey: string;
  eventType: 'LOCK' | 'UNLOCK';
  checkedRows: number;
  hashMismatches: number;
  linkageMismatches: number;
}): Promise<TransitionAlertResult> {
  const alertsEnabled = process.env.ENABLE_IMMUTABLE_AUDIT_ALERTS !== 'false';

  const gate = await evaluateAlertGate({
    chainKey,
    eventType,
    cooldownMs: AUDIT_ALERT_COOLDOWN_MS,
  });

  if (!alertsEnabled || !gate.allowed) {
    return {
      enabled: alertsEnabled,
      allowed: gate.allowed,
      event_type: eventType,
      chain_key: chainKey,
      cooldown_ms: AUDIT_ALERT_COOLDOWN_MS,
      remaining_ms: gate.remainingMs,
      dispatched: false,
      dispatch_error: null,
      checked_at: new Date().toISOString(),
    };
  }

  const actionText = eventType === 'LOCK' ? 'BROKEN' : 'RECOVERED';
  const titleText = eventType === 'LOCK' ? 'IMMUTABLE_AUDIT_LOCK' : 'IMMUTABLE_AUDIT_RECOVERED';

  try {
    const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8001';
    const response = await fetch(`${ML_ENGINE_URL}/telegram/alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ML_ENGINE_KEY || ''}`,
      },
      body: JSON.stringify({
        type: 'market',
        symbol: 'SYSTEM',
        data: {
          event: titleText,
          status: actionText,
          chain_key: chainKey,
          checked_rows: checkedRows,
          hash_mismatches: hashMismatches,
          linkage_mismatches: linkageMismatches,
          timestamp: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`ML Engine alert failed with status ${response.status}`);
    }

    return {
      enabled: true,
      allowed: true,
      event_type: eventType,
      chain_key: chainKey,
      cooldown_ms: AUDIT_ALERT_COOLDOWN_MS,
      remaining_ms: 0,
      dispatched: true,
      dispatch_error: null,
      checked_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      enabled: true,
      allowed: true,
      event_type: eventType,
      chain_key: chainKey,
      cooldown_ms: AUDIT_ALERT_COOLDOWN_MS,
      remaining_ms: 0,
      dispatched: false,
      dispatch_error: error instanceof Error ? error.message : 'Failed to dispatch immutable audit alert',
      checked_at: new Date().toISOString(),
    };
  }
}

async function evaluateAlertGate({
  chainKey,
  eventType,
  cooldownMs,
}: {
  chainKey: string;
  eventType: 'LOCK' | 'UNLOCK';
  cooldownMs: number;
}): Promise<{ allowed: boolean; remainingMs: number }> {
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    await client.query(
      `
        INSERT INTO runtime_config_chain_state (
          chain_key,
          is_valid,
          checked_rows,
          hash_mismatches,
          linkage_mismatches,
          last_verified_at,
          updated_at
        ) VALUES ($1, TRUE, 0, 0, 0, NOW(), NOW())
        ON CONFLICT (chain_key) DO NOTHING
      `,
      [chainKey],
    );

    const state = await client.query(
      `
        SELECT last_lock_alert_at, last_unlock_alert_at
        FROM runtime_config_chain_state
        WHERE chain_key = $1
        LIMIT 1
        FOR UPDATE
      `,
      [chainKey],
    );

    const row = state.rows[0] as { last_lock_alert_at?: string | null; last_unlock_alert_at?: string | null } | undefined;
    const lastAlertAtRaw = eventType === 'LOCK' ? row?.last_lock_alert_at || null : row?.last_unlock_alert_at || null;
    const nowMs = Date.now();
    const lastMs = lastAlertAtRaw ? new Date(lastAlertAtRaw).getTime() : 0;
    const elapsedMs = lastMs > 0 ? Math.max(0, nowMs - lastMs) : Number.POSITIVE_INFINITY;
    const allowed = elapsedMs >= cooldownMs;
    const remainingMs = allowed ? 0 : Math.max(0, cooldownMs - elapsedMs);

    if (allowed) {
      const updateColumn = eventType === 'LOCK' ? 'last_lock_alert_at' : 'last_unlock_alert_at';
      await client.query(
        `
          UPDATE runtime_config_chain_state
          SET ${updateColumn} = NOW(), updated_at = NOW()
          WHERE chain_key = $1
        `,
        [chainKey],
      );
    }

    await client.query('COMMIT');
    return { allowed, remainingMs };
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // noop
      }
    }
    console.error('evaluate immutable audit alert gate failed:', error);
    return { allowed: false, remainingMs: cooldownMs };
  } finally {
    if (client) {
      client.release();
    }
  }
}
