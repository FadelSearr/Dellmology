import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * System health check endpoint
 */
export async function GET(request: Request) {
  try {
    const isSystemActive = process.env.SYSTEM_ACTIVE !== 'false';

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

    return NextResponse.json({
      status: 'OK',
      is_system_active: isSystemActive,
      kill_switch_reason: isSystemActive ? null : 'Cloud kill-switch active',
      sse_connected: true,  // In production, track this from streamer
      db_connected: dbConnected,
      data_integrity: dataIntegrity,
      api_rate_limit: 65,   // Track from requests
      timestamp: new Date().toISOString(),
      services: {
        database: dbConnected ? 'UP' : 'DOWN',
        streamer: true,  // Track from heartbeat
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
