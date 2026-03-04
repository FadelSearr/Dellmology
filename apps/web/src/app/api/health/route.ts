import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isEncryptedSessionToken } from '@/lib/security/sessionTokenCrypto';

export const dynamic = 'force-dynamic';

const ENGINE_OFFLINE_ALERT_COOLDOWN_SECONDS = 600;

async function sendEngineStatusAlert(payload: {
  event: 'ENGINE_OFFLINE' | 'ENGINE_RECOVERED';
  workerLastSeenSeconds: number | null;
  heartbeatTimeoutSeconds: number;
}) {
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
        event: payload.event,
        worker_last_seen_seconds: payload.workerLastSeenSeconds,
        heartbeat_timeout_seconds: payload.heartbeatTimeoutSeconds,
        timestamp: new Date().toISOString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`ML Engine alert failed with status ${response.status}`);
  }
}

/**
 * GET /api/health
 * System health check endpoint
 */
export async function GET(request: Request) {
  try {
    let isSystemActive = process.env.SYSTEM_ACTIVE !== 'false';
    let configuredKillReason: string | null = null;
    const heartbeatTimeoutSeconds = 60;

    try {
      const systemConfig = await db.query(
        `
          SELECT key, value
          FROM config
          WHERE key IN ('is_system_active', 'kill_switch_reason')
        `,
      );

      const systemFlag = systemConfig.rows.find((row) => row.key === 'is_system_active')?.value;
      const reasonFlag = systemConfig.rows.find((row) => row.key === 'kill_switch_reason')?.value;

      if (systemFlag === 'true' || systemFlag === 'false') {
        isSystemActive = systemFlag === 'true';
      }

      if (reasonFlag && typeof reasonFlag === 'string') {
        configuredKillReason = reasonFlag;
      }
    } catch (err) {
      console.error('System control check failed:', err);
    }

    // Check database connection
    let dbConnected = false;
    try {
      const result = await db.query('SELECT 1');
      dbConnected = result.rows.length === 1;
    } catch (err) {
      console.error('DB health check failed:', err);
    }

    // Check data integrity (sample)
    let dataIntegrity = true;
    try {
      const tradesResult = await db.query(
        'SELECT COUNT(*) as count FROM trades WHERE symbol = $1 AND timestamp > NOW() - INTERVAL \'1 hour\'',
        ['BBCA']
      );
      
      if (tradesResult.rows[0]?.count < 10) {
        dataIntegrity = false; // Low activity might indicate data issue
      }
    } catch (err) {
      dataIntegrity = false;
    }

    // Check worker heartbeat (local engine online/offline)
    let workerOnline = false;
    let workerLastSeenSeconds: number | null = null;
    try {
      const heartbeatResult = await db.query(
        "SELECT value FROM config WHERE key = 'worker_last_heartbeat' LIMIT 1",
      );
      const heartbeatValue = heartbeatResult.rows[0]?.value;
      if (heartbeatValue) {
        const heartbeatAt = new Date(heartbeatValue);
        if (!Number.isNaN(heartbeatAt.getTime())) {
          workerLastSeenSeconds = Math.max(0, Math.floor((Date.now() - heartbeatAt.getTime()) / 1000));
          workerOnline = workerLastSeenSeconds <= heartbeatTimeoutSeconds;
        }
      }
    } catch (err) {
      console.error('Worker heartbeat check failed:', err);
    }

    let deadmanAlertTriggered = false;
    let deadmanLastAlertSeconds: number | null = null;
    try {
      const deadmanConfig = await db.query(
        `
          SELECT key, value
          FROM config
          WHERE key IN ('engine_last_online_state', 'engine_offline_alert_last_sent_at')
        `,
      );

      const lastOnlineStateRaw = deadmanConfig.rows.find((row) => row.key === 'engine_last_online_state')?.value;
      const lastAlertAtRaw = deadmanConfig.rows.find((row) => row.key === 'engine_offline_alert_last_sent_at')?.value;

      const lastOnlineState = typeof lastOnlineStateRaw === 'string' ? lastOnlineStateRaw : 'unknown';
      const lastAlertAt = typeof lastAlertAtRaw === 'string' ? new Date(lastAlertAtRaw) : null;
      const lastAlertAtValid = lastAlertAt && !Number.isNaN(lastAlertAt.getTime());

      if (lastAlertAtValid) {
        deadmanLastAlertSeconds = Math.max(0, Math.floor((Date.now() - lastAlertAt.getTime()) / 1000));
      }

      const alertEnabled = process.env.ENABLE_ENGINE_OFFLINE_ALERTS !== 'false';
      const transitionedToOffline = !workerOnline && lastOnlineState !== 'offline';
      const cooldownElapsed = deadmanLastAlertSeconds === null || deadmanLastAlertSeconds >= ENGINE_OFFLINE_ALERT_COOLDOWN_SECONDS;

      if (alertEnabled && !workerOnline && (transitionedToOffline || cooldownElapsed)) {
        await sendEngineStatusAlert({
          event: 'ENGINE_OFFLINE',
          workerLastSeenSeconds,
          heartbeatTimeoutSeconds,
        });

        deadmanAlertTriggered = true;
        await db.query(
          `
            INSERT INTO config (key, value, updated_at)
            VALUES
              ('engine_last_online_state', 'offline', NOW()),
              ('engine_offline_alert_last_sent_at', $1, NOW())
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value,
                updated_at = NOW();
          `,
          [new Date().toISOString()],
        );
      } else {
        await db.query(
          `
            INSERT INTO config (key, value, updated_at)
            VALUES ('engine_last_online_state', $1, NOW())
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value,
                updated_at = NOW();
          `,
          [workerOnline ? 'online' : 'offline'],
        );
      }

      if (alertEnabled && workerOnline && lastOnlineState === 'offline') {
        await sendEngineStatusAlert({
          event: 'ENGINE_RECOVERED',
          workerLastSeenSeconds,
          heartbeatTimeoutSeconds,
        });
      }
    } catch (err) {
      console.error('Dead-man switch alert check failed:', err);
    }

    // Check session token freshness (extension heartbeat visibility)
    let tokenAvailable = false;
    let tokenStatus: 'fresh' | 'expiring' | 'expired' | 'missing' = 'missing';
    let tokenExpiresInSeconds: number | null = null;
    let tokenLastUpdatedSeconds: number | null = null;
    try {
      const tokenResult = await db.query(
        "SELECT value, expires_at, updated_at FROM config WHERE key = 'session_token' ORDER BY updated_at DESC LIMIT 1",
      );

      if (tokenResult.rows.length > 0) {
        const tokenRow = tokenResult.rows[0];
        if (!isEncryptedSessionToken(tokenRow.value)) {
          tokenAvailable = false;
          tokenStatus = 'missing';
        }
        const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null;
        const updatedAt = tokenRow.updated_at ? new Date(tokenRow.updated_at) : null;
        const nowMs = Date.now();

        if (updatedAt && !Number.isNaN(updatedAt.getTime())) {
          tokenLastUpdatedSeconds = Math.max(0, Math.floor((nowMs - updatedAt.getTime()) / 1000));
        }

        if (tokenStatus !== 'missing' && expiresAt && !Number.isNaN(expiresAt.getTime())) {
          tokenExpiresInSeconds = Math.floor((expiresAt.getTime() - nowMs) / 1000);
          if (tokenExpiresInSeconds > 900) {
            tokenAvailable = true;
            tokenStatus = 'fresh';
          } else if (tokenExpiresInSeconds > 0) {
            tokenAvailable = true;
            tokenStatus = 'expiring';
          } else {
            tokenAvailable = false;
            tokenStatus = 'expired';
          }
        } else {
          tokenAvailable = false;
          tokenStatus = 'missing';
        }
      }
    } catch (err) {
      console.error('Session token health check failed:', err);
    }

    let tokenLastSyncReason: string | null = null;
    let tokenLastJitterMs: number | null = null;
    let tokenForcedRefreshCount: number | null = null;
    let tokenExtensionLastSeenSeconds: number | null = null;
    try {
      const extensionMeta = await db.query(
        `
          SELECT key, value
          FROM config
          WHERE key IN (
            'token_last_sync_reason',
            'token_last_jitter_ms',
            'token_forced_refresh_count',
            'token_extension_last_seen'
          )
        `,
      );

      const reason = extensionMeta.rows.find((row) => row.key === 'token_last_sync_reason')?.value;
      const jitter = extensionMeta.rows.find((row) => row.key === 'token_last_jitter_ms')?.value;
      const refreshCount = extensionMeta.rows.find((row) => row.key === 'token_forced_refresh_count')?.value;
      const extensionSeenAt = extensionMeta.rows.find((row) => row.key === 'token_extension_last_seen')?.value;

      if (typeof reason === 'string' && reason.trim().length > 0) {
        tokenLastSyncReason = reason;
      }

      if (typeof jitter === 'string') {
        const parsed = Number(jitter);
        if (!Number.isNaN(parsed)) {
          tokenLastJitterMs = parsed;
        }
      }

      if (typeof refreshCount === 'string') {
        const parsed = Number(refreshCount);
        if (!Number.isNaN(parsed)) {
          tokenForcedRefreshCount = parsed;
        }
      }

      if (typeof extensionSeenAt === 'string') {
        const seenAt = new Date(extensionSeenAt);
        if (!Number.isNaN(seenAt.getTime())) {
          tokenExtensionLastSeenSeconds = Math.max(0, Math.floor((Date.now() - seenAt.getTime()) / 1000));
        }
      }
    } catch (err) {
      console.error('Token extension metadata check failed:', err);
    }

    let sseConnected = false;
    let apiRateLimit = 65;
    try {
      const telemetryConfig = await db.query(
        `
          SELECT key, value
          FROM config
          WHERE key IN (
            'streamer_last_event_at',
            'api_rate_limit_pct',
            'api_quota_remaining_pct'
          )
        `,
      );

      const streamerLastEventAtRaw = telemetryConfig.rows.find((row) => row.key === 'streamer_last_event_at')?.value;
      const apiRatePctRaw = telemetryConfig.rows.find((row) => row.key === 'api_rate_limit_pct')?.value;
      const apiQuotaPctRaw = telemetryConfig.rows.find((row) => row.key === 'api_quota_remaining_pct')?.value;

      if (typeof streamerLastEventAtRaw === 'string') {
        const streamerLastEventAt = new Date(streamerLastEventAtRaw);
        if (!Number.isNaN(streamerLastEventAt.getTime())) {
          const sseLagSeconds = Math.max(0, Math.floor((Date.now() - streamerLastEventAt.getTime()) / 1000));
          sseConnected = sseLagSeconds <= 20;
        }
      }

      const parsedApiRate = Number(apiRatePctRaw);
      const parsedApiQuota = Number(apiQuotaPctRaw);

      if (!Number.isNaN(parsedApiRate)) {
        apiRateLimit = Math.max(0, Math.min(100, parsedApiRate));
      } else if (!Number.isNaN(parsedApiQuota)) {
        apiRateLimit = Math.max(0, Math.min(100, parsedApiQuota));
      } else {
        apiRateLimit = tokenStatus === 'fresh' ? 80 : tokenStatus === 'expiring' ? 45 : 20;
      }
    } catch (err) {
      console.error('Telemetry health check failed:', err);
      sseConnected = workerOnline;
      apiRateLimit = tokenStatus === 'fresh' ? 80 : tokenStatus === 'expiring' ? 45 : 20;
    }

    if (!sseConnected && workerOnline) {
      sseConnected = true;
    }

    const killSwitchReason =
      !isSystemActive
        ? configuredKillReason || 'Cloud kill-switch active'
        : !workerOnline
          ? 'Engine Offline - heartbeat timeout'
          : null;

    return NextResponse.json({
      status: 'OK',
      is_system_active: isSystemActive,
      kill_switch_reason: killSwitchReason,
      sse_connected: sseConnected,
      db_connected: dbConnected,
      data_integrity: dataIntegrity,
      worker_online: workerOnline,
      worker_last_seen_seconds: workerLastSeenSeconds,
      heartbeat_timeout_seconds: heartbeatTimeoutSeconds,
      deadman_alert_triggered: deadmanAlertTriggered,
      deadman_last_alert_seconds: deadmanLastAlertSeconds,
      deadman_alert_cooldown_seconds: ENGINE_OFFLINE_ALERT_COOLDOWN_SECONDS,
      token_available: tokenAvailable,
      token_status: tokenStatus,
      token_expires_in_seconds: tokenExpiresInSeconds,
      token_last_updated_seconds: tokenLastUpdatedSeconds,
      token_last_sync_reason: tokenLastSyncReason,
      token_last_jitter_ms: tokenLastJitterMs,
      token_forced_refresh_count: tokenForcedRefreshCount,
      token_extension_last_seen_seconds: tokenExtensionLastSeenSeconds,
      api_rate_limit: apiRateLimit,
      timestamp: new Date().toISOString(),
      services: {
        database: dbConnected ? 'UP' : 'DOWN',
        streamer: sseConnected && workerOnline,
        cache: true
      }
    });

  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'ERROR',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
