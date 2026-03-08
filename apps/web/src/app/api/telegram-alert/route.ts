import { NextRequest, NextResponse } from 'next/server';
import { verifyRuntimeConfigAuditChain } from '@/lib/security/immutableAudit';
import { buildImmutableAuditLockPayload } from '@/lib/security/lockPayloads';

interface AlertPayload {
  type: 'trading' | 'market' | 'broker' | 'wash_sale' | 'screener' | 'backtest';
  symbol: string;
  data: Record<string, unknown>;
}

/**
 * POST /api/telegram-alert
 * Send alerts to Telegram via ML engine service
 */
export async function POST(req: NextRequest) {
  try {
    const immutableAudit = await verifyRuntimeConfigAuditChain();
    if (!immutableAudit.valid) {
      return NextResponse.json(buildImmutableAuditLockPayload(immutableAudit, 'Immutable audit chain lock active; telegram alert blocked'), {
        status: 423,
      });
    }

    const payload: AlertPayload = await req.json();

    // Validation
    if (!payload.type || !payload.symbol || !payload.data) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Forward to Python ML engine
    const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8001';
    
    const response = await fetch(`${ML_ENGINE_URL}/telegram/alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ML_ENGINE_KEY || ''}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`ML Engine error: ${response.status}`);
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      alert_type: payload.type,
      symbol: payload.symbol,
      sent_at: new Date().toISOString(),
      details: result,
    });
  } catch (error) {
    console.error('Telegram alert error:', error);
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to send alert',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/telegram-alert
 * Get alert status/history
 */
export async function GET(req: NextRequest) {
  try {
    const symbol = req.nextUrl.searchParams.get('symbol');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10');

    const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8001';
    
    const query = new URLSearchParams();
    if (symbol) query.append('symbol', symbol);
    query.append('limit', limit.toString());

    const response = await fetch(`${ML_ENGINE_URL}/telegram/history?${query}`, {
      headers: {
        'Authorization': `Bearer ${process.env.ML_ENGINE_KEY || ''}`,
      },
    });

    if (!response.ok) {
      throw new Error(`ML Engine error: ${response.status}`);
    }

    const history = await response.json();

    return NextResponse.json({
      alerts: history,
      count: Array.isArray(history) ? history.length : 0,
    });
  } catch (error) {
    console.error('Error fetching alert history:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch history',
      },
      { status: 500 }
    );
  }
}

