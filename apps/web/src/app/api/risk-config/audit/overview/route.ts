import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
const OVERVIEW_CACHE_TTL_MS = 5_000;
const OVERVIEW_THROTTLE_MS = 1_500;

type OverviewPayload = {
  success: boolean;
  key: string;
  chain: {
    valid: boolean;
    checked_rows: number;
    hash_mismatches: number;
    linkage_mismatches: number;
    verified_at: string;
  };
  transition: { changed: boolean; event_type: 'LOCK' | 'UNLOCK' | null };
  recent_events: LockEventRow[];
  latest_audit: Record<string, unknown> | null;
  alert_gate: {
    cooldown_ms: number;
    lock: {
      last_alert_at: string | null;
      remaining_ms: number;
    };
    unlock: {
      last_alert_at: string | null;
      remaining_ms: number;
    };
  };
  state: Record<string, unknown> | null;
};

const overviewCache = new Map<string, { payload: OverviewPayload; expiresAt: number; createdAt: number }>();
const overviewLastRequestAt = new Map<string, number>();
const overviewInFlight = new Map<string, Promise<OverviewPayload>>();

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = (searchParams.get('key') || 'failed_queue_alert_threshold').trim() || 'failed_queue_alert_threshold';
    const verifyLimit = Math.min(500, Math.max(1, Number(searchParams.get('verify_limit') || 200)));
    const eventLimit = Math.min(20, Math.max(1, Number(searchParams.get('event_limit') || 5)));
    const cooldownMs = Math.min(60 * 60 * 1000, Math.max(30 * 1000, Number(searchParams.get('cooldown_ms') || 10 * 60 * 1000)));
    const cacheKey = `${key}:${verifyLimit}:${eventLimit}:${cooldownMs}`;
    const now = Date.now();
    const lastRequestAt = overviewLastRequestAt.get(cacheKey) || 0;
    const cached = overviewCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      const isThrottled = now - lastRequestAt < OVERVIEW_THROTTLE_MS;
      overviewLastRequestAt.set(cacheKey, now);
      return NextResponse.json({
        ...cached.payload,
        meta: {
          cached: true,
          throttled: isThrottled,
          cache_ttl_ms: OVERVIEW_CACHE_TTL_MS,
          cache_age_ms: Math.max(0, now - cached.createdAt),
        },
      });
    }

    if (now - lastRequestAt < OVERVIEW_THROTTLE_MS && cached) {
      overviewLastRequestAt.set(cacheKey, now);
      return NextResponse.json({
        ...cached.payload,
        meta: {
          cached: true,
          throttled: true,
          cache_ttl_ms: OVERVIEW_CACHE_TTL_MS,
          cache_age_ms: Math.max(0, now - cached.createdAt),
          stale_cache: true,
        },
      });
    }

    overviewLastRequestAt.set(cacheKey, now);

    const existingInFlight = overviewInFlight.get(cacheKey);
    const payloadPromise =
      existingInFlight ||
      buildOverviewPayload({
        key,
        verifyLimit,
        eventLimit,
        cooldownMs,
      }).finally(() => {
        overviewInFlight.delete(cacheKey);
      });

    if (!existingInFlight) {
      overviewInFlight.set(cacheKey, payloadPromise);
    }

    const payload = await payloadPromise;

    overviewCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      ...payload,
      meta: {
        cached: false,
        throttled: false,
        deduped_in_flight: Boolean(existingInFlight),
        cache_ttl_ms: OVERVIEW_CACHE_TTL_MS,
        cache_age_ms: 0,
      },
    });
  } catch (error) {
    console.error('risk-config audit overview GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch risk-config audit overview' }, { status: 500 });
  }
}

async function buildOverviewPayload({
  key,
  verifyLimit,
  eventLimit,
  cooldownMs,
}: {
  key: string;
  verifyLimit: number;
  eventLimit: number;
  cooldownMs: number;
}): Promise<OverviewPayload> {
  await ensureConfigTables();

  const auditResult = await db.query(
    `
        SELECT id, config_key, old_value, new_value, actor, source, payload_hash, previous_hash, record_hash, created_at
        FROM runtime_config_audit
        WHERE config_key = $1
        ORDER BY id ASC
        LIMIT $2
      `,
    [key, verifyLimit],
  );

  const rows = auditResult.rows as AuditRow[];

  let previousRecordHash: string | null = null;
  let hashMismatches = 0;
  let linkageMismatches = 0;

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
    }

    if (row.previous_hash !== (previousRecordHash || null)) {
      linkageMismatches += 1;
    }

    previousRecordHash = row.record_hash;
  }

  const valid = hashMismatches === 0 && linkageMismatches === 0;

  const stateResult = await db.query(
    `
        SELECT is_valid, last_lock_alert_at, last_unlock_alert_at
        FROM runtime_config_chain_state
        WHERE chain_key = $1
        LIMIT 1
      `,
    [key],
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
      [key, valid, rows.length, hashMismatches, linkageMismatches],
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
          key,
          eventType,
          rows.length,
          hashMismatches,
          linkageMismatches,
          'overview-transition',
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
      [key, valid, rows.length, hashMismatches, linkageMismatches],
    );
  }

  const stateAfterResult = await db.query(
    `
        SELECT chain_key, is_valid, checked_rows, hash_mismatches, linkage_mismatches, last_verified_at, updated_at, last_lock_alert_at, last_unlock_alert_at
        FROM runtime_config_chain_state
        WHERE chain_key = $1
        LIMIT 1
      `,
    [key],
  );

  const recentEventsResult = await db.query(
    `
        SELECT id, chain_key, event_type, checked_rows, hash_mismatches, linkage_mismatches, note, created_at
        FROM runtime_config_lock_events
        WHERE chain_key = $1
        ORDER BY id DESC
        LIMIT $2
      `,
    [key, eventLimit],
  );

  const latestAuditResult = await db.query(
    `
        SELECT id, config_key, old_value, new_value, actor, source, record_hash, created_at
        FROM runtime_config_audit
        WHERE config_key = $1
        ORDER BY id DESC
        LIMIT 1
      `,
    [key],
  );

  const state = stateAfterResult.rows[0] as {
    last_lock_alert_at?: string | null;
    last_unlock_alert_at?: string | null;
    [k: string]: unknown;
  } | undefined;

  const now = Date.now();
  const lockLastMs = state?.last_lock_alert_at ? new Date(String(state.last_lock_alert_at)).getTime() : 0;
  const unlockLastMs = state?.last_unlock_alert_at ? new Date(String(state.last_unlock_alert_at)).getTime() : 0;

  const lockRemainingMs = lockLastMs > 0 ? Math.max(0, cooldownMs - (now - lockLastMs)) : 0;
  const unlockRemainingMs = unlockLastMs > 0 ? Math.max(0, cooldownMs - (now - unlockLastMs)) : 0;

  return {
    success: true,
    key,
    chain: {
      valid,
      checked_rows: rows.length,
      hash_mismatches: hashMismatches,
      linkage_mismatches: linkageMismatches,
      verified_at: new Date().toISOString(),
    },
    transition,
    recent_events: recentEventsResult.rows as LockEventRow[],
    latest_audit: latestAuditResult.rows[0] || null,
    alert_gate: {
      cooldown_ms: cooldownMs,
      lock: {
        last_alert_at: state?.last_lock_alert_at || null,
        remaining_ms: lockRemainingMs,
      },
      unlock: {
        last_alert_at: state?.last_unlock_alert_at || null,
        remaining_ms: unlockRemainingMs,
      },
    },
    state: (stateAfterResult.rows[0] as Record<string, unknown>) || null,
  };
}

async function ensureConfigTables() {
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
