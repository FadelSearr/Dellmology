import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RecoveryStatus = 'SUCCESS' | 'FAILED' | 'LOCKED';

interface RecoveryTelemetryBody {
  source?: string;
  status?: RecoveryStatus;
  message?: string;
  cooldown_seconds?: number | null;
  symbol?: string | null;
}

async function ensureRecoveryTelemetryTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS system_recovery_telemetry (
      id BIGSERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      cooldown_seconds INTEGER,
      symbol TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_system_recovery_telemetry_source_time
      ON system_recovery_telemetry (source, created_at DESC)
  `);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source')?.trim() || 'deadman';
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 20)));

    await ensureRecoveryTelemetryTable();

    const [summaryResult, logsResult] = await Promise.all([
      db.query(
        `
          SELECT
            COUNT(*)::INT AS attempts,
            COUNT(*) FILTER (WHERE status = 'SUCCESS')::INT AS successes,
            COUNT(*) FILTER (WHERE status <> 'SUCCESS')::INT AS failures,
            MAX(created_at) AS last_attempt_at,
            (
              SELECT status
              FROM system_recovery_telemetry
              WHERE source = $1
              ORDER BY created_at DESC
              LIMIT 1
            ) AS last_status
          FROM system_recovery_telemetry
          WHERE source = $1
        `,
        [source],
      ),
      db.query(
        `
          SELECT id, source, status, message, cooldown_seconds, symbol, created_at
          FROM system_recovery_telemetry
          WHERE source = $1
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [source, limit],
      ),
    ]);

    const summaryRow = summaryResult.rows[0] || {};

    return NextResponse.json({
      success: true,
      source,
      summary: {
        attempts: Number(summaryRow.attempts || 0),
        successes: Number(summaryRow.successes || 0),
        failures: Number(summaryRow.failures || 0),
        last_attempt_at: summaryRow.last_attempt_at || null,
        last_status: summaryRow.last_status || 'IDLE',
      },
      logs: logsResult.rows,
    });
  } catch (error) {
    console.error('system-control recovery-telemetry GET failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch recovery telemetry' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecoveryTelemetryBody;

    const source = body.source?.trim() || 'deadman';
    const status = body.status;
    const message = (body.message || '').trim();
    const cooldownSeconds =
      typeof body.cooldown_seconds === 'number' && Number.isFinite(body.cooldown_seconds)
        ? Math.max(0, Math.floor(body.cooldown_seconds))
        : null;
    const symbol = body.symbol?.trim() || null;

    if (!status || !['SUCCESS', 'FAILED', 'LOCKED'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    if (message.length === 0) {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    await ensureRecoveryTelemetryTable();

    const result = await db.query(
      `
        INSERT INTO system_recovery_telemetry (source, status, message, cooldown_seconds, symbol)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, source, status, message, cooldown_seconds, symbol, created_at
      `,
      [source, status, message, cooldownSeconds, symbol],
    );

    return NextResponse.json({
      success: true,
      event: result.rows[0],
    });
  } catch (error) {
    console.error('system-control recovery-telemetry POST failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to persist recovery telemetry' }, { status: 500 });
  }
}
