import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RecoveryEscalationAuditEventType = 'DETECTED' | 'SUPPRESSED' | 'ACKNOWLEDGED';
type RecoveryEscalationLevel = 'WARN' | 'HIGH' | 'CRITICAL';

interface RecoveryEscalationAuditBody {
  event_type?: RecoveryEscalationAuditEventType;
  level?: RecoveryEscalationLevel;
  signature?: string | null;
  source?: string | null;
  symbol?: string | null;
  suppressed?: boolean;
}

async function ensureRecoveryEscalationAuditTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS system_recovery_escalation_audit (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      signature TEXT,
      suppressed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE system_recovery_escalation_audit
    ADD COLUMN IF NOT EXISTS level TEXT
  `);

  await db.query(`
    ALTER TABLE system_recovery_escalation_audit
    ADD COLUMN IF NOT EXISTS source TEXT
  `);

  await db.query(`
    ALTER TABLE system_recovery_escalation_audit
    ADD COLUMN IF NOT EXISTS symbol TEXT
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_system_recovery_escalation_audit_time
      ON system_recovery_escalation_audit (created_at DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_system_recovery_escalation_audit_event
      ON system_recovery_escalation_audit (event_type, created_at DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_system_recovery_escalation_audit_source_event
      ON system_recovery_escalation_audit (source, event_type, created_at DESC)
  `);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 20)));
    const windowMinutes = Math.min(24 * 60, Math.max(0, Math.floor(Number(searchParams.get('window_minutes') || 0))));
    const windowFilterClause =
      windowMinutes > 0
        ? `WHERE created_at >= NOW() - INTERVAL '${windowMinutes} minutes'`
        : '';

    await ensureRecoveryEscalationAuditTable();

    const [summaryResult, logsResult, sourceSummaryResult, windowSourceSummaryResult, windowLogsResult] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) FILTER (
            WHERE event_type = 'DETECTED'
               OR event_type = 'SUPPRESSED'
               OR (event_type = 'DETECTED' AND suppressed = TRUE)
          )::INT AS detected_count,
          COUNT(*) FILTER (
            WHERE event_type = 'SUPPRESSED'
               OR (event_type = 'DETECTED' AND suppressed = TRUE)
          )::INT AS suppressed_count,
          COUNT(*) FILTER (WHERE event_type = 'ACKNOWLEDGED')::INT AS acknowledged_count,
          MAX(created_at) FILTER (WHERE event_type = 'ACKNOWLEDGED') AS last_acknowledged_at
        FROM system_recovery_escalation_audit
      `),
      db.query(
        `
          SELECT
            id,
            event_type,
            COALESCE(level, 'WARN') AS level,
            signature,
            source,
            symbol,
            created_at,
            CASE
              WHEN event_type = 'SUPPRESSED' OR (event_type = 'DETECTED' AND suppressed = TRUE) THEN TRUE
              ELSE FALSE
            END AS suppressed
          FROM system_recovery_escalation_audit
          ORDER BY created_at DESC
          LIMIT $1
        `,
        [limit],
      ),
      db.query(`
        SELECT
          COALESCE(source, 'unknown') AS source,
          COUNT(*) FILTER (
            WHERE event_type = 'DETECTED'
               OR event_type = 'SUPPRESSED'
               OR (event_type = 'DETECTED' AND suppressed = TRUE)
          )::INT AS detected_count,
          COUNT(*) FILTER (
            WHERE event_type = 'SUPPRESSED'
               OR (event_type = 'DETECTED' AND suppressed = TRUE)
          )::INT AS suppressed_count,
          MAX(created_at) AS last_event_at
        FROM system_recovery_escalation_audit
        GROUP BY COALESCE(source, 'unknown')
        ORDER BY suppressed_count DESC, detected_count DESC
      `),
      db.query(`
        SELECT
          COALESCE(source, 'unknown') AS source,
          COUNT(*) FILTER (
            WHERE event_type = 'DETECTED'
               OR event_type = 'SUPPRESSED'
               OR (event_type = 'DETECTED' AND suppressed = TRUE)
          )::INT AS detected_count,
          COUNT(*) FILTER (
            WHERE event_type = 'SUPPRESSED'
               OR (event_type = 'DETECTED' AND suppressed = TRUE)
          )::INT AS suppressed_count,
          MAX(created_at) AS last_event_at
        FROM system_recovery_escalation_audit
        ${windowFilterClause}
        GROUP BY COALESCE(source, 'unknown')
        ORDER BY suppressed_count DESC, detected_count DESC
      `),
      db.query(
        `
          SELECT
            id,
            event_type,
            COALESCE(level, 'WARN') AS level,
            signature,
            source,
            symbol,
            created_at,
            CASE
              WHEN event_type = 'SUPPRESSED' OR (event_type = 'DETECTED' AND suppressed = TRUE) THEN TRUE
              ELSE FALSE
            END AS suppressed
          FROM system_recovery_escalation_audit
          ${windowFilterClause}
          ORDER BY created_at DESC
          LIMIT $1
        `,
        [limit],
      ),
    ]);

    const row = summaryResult.rows[0] || {};
    const detectedCount = Number(row.detected_count || 0);
    const suppressedCount = Number(row.suppressed_count || 0);

    return NextResponse.json({
      success: true,
      summary: {
        detected_count: detectedCount,
        suppressed_count: suppressedCount,
        acknowledged_count: Number(row.acknowledged_count || 0),
        suppression_ratio_pct: detectedCount > 0 ? (suppressedCount / detectedCount) * 100 : 0,
        last_acknowledged_at: row.last_acknowledged_at || null,
      },
      source_summary: sourceSummaryResult.rows.map((item) => {
        const sourceDetectedCount = Number(item.detected_count || 0);
        const sourceSuppressedCount = Number(item.suppressed_count || 0);
        return {
          source: item.source || 'unknown',
          detected_count: sourceDetectedCount,
          suppressed_count: sourceSuppressedCount,
          suppression_ratio_pct: sourceDetectedCount > 0 ? (sourceSuppressedCount / sourceDetectedCount) * 100 : 0,
          last_event_at: item.last_event_at || null,
        };
      }),
      window_minutes: windowMinutes,
      window_source_summary: windowSourceSummaryResult.rows.map((item) => {
        const sourceDetectedCount = Number(item.detected_count || 0);
        const sourceSuppressedCount = Number(item.suppressed_count || 0);
        return {
          source: item.source || 'unknown',
          detected_count: sourceDetectedCount,
          suppressed_count: sourceSuppressedCount,
          suppression_ratio_pct: sourceDetectedCount > 0 ? (sourceSuppressedCount / sourceDetectedCount) * 100 : 0,
          last_event_at: item.last_event_at || null,
        };
      }),
      logs: logsResult.rows,
      window_logs: windowLogsResult.rows,
    });
  } catch (error) {
    console.error('system-control recovery-escalation-audit GET failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch escalation audit summary' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecoveryEscalationAuditBody;
    const eventType = body.event_type;
    const level = body.level && ['WARN', 'HIGH', 'CRITICAL'].includes(body.level) ? body.level : 'WARN';
    const signature = body.signature?.trim() || null;
    const source = body.source?.trim() || null;
    const symbol = body.symbol?.trim() || null;
    const suppressed = body.suppressed === true || eventType === 'SUPPRESSED';

    if (!eventType || !['DETECTED', 'SUPPRESSED', 'ACKNOWLEDGED'].includes(eventType)) {
      return NextResponse.json({ success: false, error: 'Invalid event_type' }, { status: 400 });
    }

    await ensureRecoveryEscalationAuditTable();

    const result = await db.query(
      `
        INSERT INTO system_recovery_escalation_audit (event_type, level, signature, source, symbol, suppressed)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, event_type, level, signature, source, symbol, suppressed, created_at
      `,
      [eventType, level, signature, source, symbol, eventType === 'ACKNOWLEDGED' ? false : suppressed],
    );

    return NextResponse.json({
      success: true,
      event: result.rows[0],
    });
  } catch (error) {
    console.error('system-control recovery-escalation-audit POST failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to persist escalation audit event' }, { status: 500 });
  }
}
