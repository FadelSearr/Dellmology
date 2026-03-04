import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyRuntimeConfigAuditChain } from '@/lib/security/immutableAudit';

export const dynamic = 'force-dynamic';

const DEADMAN_STATE_KEY = 'engine_last_online_state';
const DEADMAN_LAST_ALERT_KEY = 'engine_offline_alert_last_sent_at';
const DEADMAN_LAST_RESET_KEY = 'engine_deadman_last_reset_at';
const DEADMAN_RESET_COOLDOWN_SECONDS = 30;

export async function GET() {
  try {
    const result = await db.query(
      `
        SELECT key, value, updated_at
        FROM config
        WHERE key IN ($1, $2, $3)
      `,
      [DEADMAN_STATE_KEY, DEADMAN_LAST_ALERT_KEY, DEADMAN_LAST_RESET_KEY],
    );

    const stateRow = result.rows.find((row) => row.key === DEADMAN_STATE_KEY);
    const lastAlertRow = result.rows.find((row) => row.key === DEADMAN_LAST_ALERT_KEY);
    const lastResetRow = result.rows.find((row) => row.key === DEADMAN_LAST_RESET_KEY);

    return NextResponse.json({
      success: true,
      deadman_state: stateRow?.value || 'unknown',
      last_alert_at: lastAlertRow?.value || null,
      last_reset_at: lastResetRow?.value || null,
      updated_at: stateRow?.updated_at || null,
    });
  } catch (error) {
    console.error('system-control deadman GET failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to read deadman state' },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const immutableAudit = await verifyRuntimeConfigAuditChain();
    if (!immutableAudit.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Runtime config audit chain verification failed',
          lock: {
            checked_rows: immutableAudit.checkedRows,
            hash_mismatches: immutableAudit.hashMismatches,
            linkage_mismatches: immutableAudit.linkageMismatches,
          },
        },
        { status: 423 },
      );
    }

    const lastResetResult = await db.query(
      `
        SELECT value
        FROM config
        WHERE key = $1
        LIMIT 1
      `,
      [DEADMAN_LAST_RESET_KEY],
    );

    const lastResetRaw = lastResetResult.rows[0]?.value;
    if (typeof lastResetRaw === 'string') {
      const lastResetAt = new Date(lastResetRaw);
      if (!Number.isNaN(lastResetAt.getTime())) {
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastResetAt.getTime()) / 1000));
        if (elapsedSeconds < DEADMAN_RESET_COOLDOWN_SECONDS) {
          return NextResponse.json(
            {
              success: false,
              error: 'Deadman reset is cooling down',
              retry_after_seconds: DEADMAN_RESET_COOLDOWN_SECONDS - elapsedSeconds,
            },
            { status: 429 },
          );
        }
      }
    }

    const resetAt = new Date().toISOString();

    await db.query(
      `
        INSERT INTO config (key, value, updated_at)
        VALUES
          ($1, 'unknown', NOW()),
          ($2, $4, NOW()),
          ($3, NULL, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = NOW();
      `,
      [DEADMAN_STATE_KEY, DEADMAN_LAST_RESET_KEY, DEADMAN_LAST_ALERT_KEY, resetAt],
    );

    return NextResponse.json({
      success: true,
      message: 'Deadman state reset successfully',
      deadman_state: 'unknown',
      last_alert_at: null,
      last_reset_at: resetAt,
      retry_after_seconds: DEADMAN_RESET_COOLDOWN_SECONDS,
    });
  } catch (error) {
    console.error('system-control deadman POST failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset deadman state' },
      { status: 500 },
    );
  }
}
