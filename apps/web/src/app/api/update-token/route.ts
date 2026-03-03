import { db } from '@/lib/db';
import { computeShortLivedExpiry, encryptSessionToken } from '@/lib/security/sessionTokenCrypto';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OPTIONS /api/update-token
 * Handle CORS preflight requests from the Chrome extension.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/**
 * POST /api/update-token
 * Receives and stores a new session token from the browser extension.
 * This acts as the bridge between the user's authenticated session and the backend services.
 * 
 * Body: {
 *   token: string (required) - The JWT bearer token from Stockbit
 *   expires_at: string | number (optional) - Expiration timestamp (unix seconds or ISO string)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, expires_at, meta } = body;

    // Validate token
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Token is required and must be a string' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Parse expires_at - handle both unix timestamp (number) and ISO string
    let expiresAtDate: Date | null = null;
    if (expires_at) {
      if (typeof expires_at === 'number') {
        // Unix timestamp in seconds
        expiresAtDate = new Date(expires_at * 1000);
      } else if (typeof expires_at === 'string') {
        // ISO string
        expiresAtDate = new Date(expires_at);
      }
    }

    const effectiveExpiry = computeShortLivedExpiry(expiresAtDate);
    const encryptedToken = encryptSessionToken(token);

    // Store encrypted token in database
    const query = `
      INSERT INTO config (key, value, expires_at, updated_at)
      VALUES ('session_token', $1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET 
        value = EXCLUDED.value,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      RETURNING value, expires_at, updated_at;
    `;

    const result = await db.query(query, [
      encryptedToken,
      effectiveExpiry.toISOString(),
    ]);

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Failed to store token in database');
    }

    const syncReason = typeof meta?.sync_reason === 'string' ? meta.sync_reason : 'capture';
    const syncJitterMs = typeof meta?.jitter_ms === 'number' ? Math.max(0, Math.floor(meta.jitter_ms)) : null;
    const forcedRefreshCount = typeof meta?.forced_refresh_count === 'number' ? Math.max(0, Math.floor(meta.forced_refresh_count)) : null;

    await db.query(
      `
        INSERT INTO config (key, value, updated_at)
        VALUES
          ('token_last_sync_reason', $1, NOW()),
          ('token_last_jitter_ms', $2, NOW()),
          ('token_forced_refresh_count', $3, NOW()),
          ('token_extension_last_seen', $4, NOW())
        ON CONFLICT (key) DO UPDATE
        SET
          value = EXCLUDED.value,
          updated_at = NOW();
      `,
      [
        syncReason,
        syncJitterMs !== null ? String(syncJitterMs) : null,
        forcedRefreshCount !== null ? String(forcedRefreshCount) : null,
        new Date().toISOString(),
      ],
    );

    console.log('[API] Token updated successfully from Chrome extension');

    return NextResponse.json(
      {
        success: true,
        message: 'Token updated successfully (encrypted + short-lived TTL)',
        expires_at: effectiveExpiry.toISOString(),
      },
      {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    );

  } catch (error: unknown) {
    console.error('[API] Update Token Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update token';
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    );
  }
}
