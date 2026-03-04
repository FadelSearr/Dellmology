import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyRuntimeConfigAuditChain } from '@/lib/security/immutableAudit';

export const dynamic = 'force-dynamic';

const RESET_REQUESTED_KEY = 'worker_hard_reset_requested';
const RESET_REASON_KEY = 'worker_hard_reset_reason';
const RESET_REQUESTED_AT_KEY = 'worker_hard_reset_requested_at';
const RESET_ACK_AT_KEY = 'worker_hard_reset_ack_at';
const RESET_ACK_SOURCE_KEY = 'worker_hard_reset_ack_source';

type Action = 'request' | 'acknowledge' | 'clear';

export async function GET() {
  try {
    const result = await db.query(
      `
        SELECT key, value, updated_at
        FROM config
        WHERE key IN ($1, $2, $3, $4, $5)
      `,
      [RESET_REQUESTED_KEY, RESET_REASON_KEY, RESET_REQUESTED_AT_KEY, RESET_ACK_AT_KEY, RESET_ACK_SOURCE_KEY],
    );

    const requestedRaw = result.rows.find((row) => row.key === RESET_REQUESTED_KEY)?.value;
    const reason = result.rows.find((row) => row.key === RESET_REASON_KEY)?.value || null;
    const requestedAt = result.rows.find((row) => row.key === RESET_REQUESTED_AT_KEY)?.value || null;
    const ackAt = result.rows.find((row) => row.key === RESET_ACK_AT_KEY)?.value || null;
    const ackSource = result.rows.find((row) => row.key === RESET_ACK_SOURCE_KEY)?.value || null;

    return NextResponse.json({
      success: true,
      reset_requested: requestedRaw === 'true',
      reason,
      requested_at: requestedAt,
      acknowledged_at: ackAt,
      acknowledged_source: ackSource,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('system-control worker-reset GET failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read worker reset state' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const immutableAudit = await verifyRuntimeConfigAuditChain();
    if (!immutableAudit.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Immutable audit chain lock active; worker reset blocked',
          lock: true,
          checked_rows: immutableAudit.checkedRows,
          hash_mismatches: immutableAudit.hashMismatches,
          linkage_mismatches: immutableAudit.linkageMismatches,
        },
        { status: 423 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: Action;
      reason?: string;
      source?: string;
    };

    const action = body.action || 'request';
    if (!['request', 'acknowledge', 'clear'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    if (action === 'request') {
      const reason = (body.reason || 'Statistical fingerprint deviation detected').trim();
      await db.query(
        `
          INSERT INTO config (key, value, updated_at)
          VALUES
            ($1, 'true', NOW()),
            ($2, $6, NOW()),
            ($3, $6, NOW())
          ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_at = NOW();
        `,
        [RESET_REQUESTED_KEY, RESET_REASON_KEY, RESET_REQUESTED_AT_KEY, RESET_ACK_AT_KEY, RESET_ACK_SOURCE_KEY, reason],
      );

      return NextResponse.json({
        success: true,
        action,
        reset_requested: true,
        reason,
        requested_at: nowIso,
      });
    }

    if (action === 'acknowledge') {
      const source = (body.source || 'worker').trim();
      await db.query(
        `
          INSERT INTO config (key, value, updated_at)
          VALUES
            ($1, 'false', NOW()),
            ($2, $6, NOW()),
            ($3, $7, NOW())
          ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_at = NOW();
        `,
        [RESET_REQUESTED_KEY, RESET_REASON_KEY, RESET_REQUESTED_AT_KEY, RESET_ACK_AT_KEY, RESET_ACK_SOURCE_KEY, nowIso, source],
      );

      return NextResponse.json({
        success: true,
        action,
        reset_requested: false,
        acknowledged_at: nowIso,
        acknowledged_source: source,
      });
    }

    await db.query(
      `
        INSERT INTO config (key, value, updated_at)
        VALUES
          ($1, 'false', NOW()),
          ($2, NULL, NOW()),
          ($3, NULL, NOW()),
          ($4, NULL, NOW()),
          ($5, NULL, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = NOW();
      `,
      [RESET_REQUESTED_KEY, RESET_REASON_KEY, RESET_REQUESTED_AT_KEY, RESET_ACK_AT_KEY, RESET_ACK_SOURCE_KEY],
    );

    return NextResponse.json({
      success: true,
      action,
      reset_requested: false,
      cleared_at: nowIso,
    });
  } catch (error) {
    console.error('system-control worker-reset POST failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update worker reset state' }, { status: 500 });
  }
}
