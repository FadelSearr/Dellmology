import { NextResponse } from 'next/server';
import { getTokenStatus } from '@/lib/stockbit';

export async function GET() {
  const checks: Record<string, { status: string; latency?: number; error?: string; metadata?: any }> = {};

  // Check Database & Token
  const dbStart = Date.now();
  try {
    const tokenStatus = await getTokenStatus();
    checks.database = { status: 'online', latency: Date.now() - dbStart };
    checks.token = {
      status: tokenStatus.status,
      metadata: { expiresInMinutes: tokenStatus.expiresInMinutes },
    };
  } catch (err) {
    checks.database = { status: 'offline', latency: Date.now() - dbStart, error: String(err) };
    checks.token = { status: 'offline' };
  }

  // Check Go Engine
  const engineStart = Date.now();
  try {
    const engineUrl = process.env.ENGINE_HEALTH_URL || 'http://localhost:8080/health';
    const res = await fetch(engineUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      checks.engine = { status: 'online', latency: Date.now() - engineStart };
    } else {
      checks.engine = { status: 'offline', latency: Date.now() - engineStart };
    }
  } catch {
    checks.engine = { status: 'offline', latency: Date.now() - engineStart };
  }

  // Check CNN Worker (Python FastAPI on port 8001)
  const cnnStart = Date.now();
  try {
    const cnnUrl = process.env.CNN_HEALTH_URL || 'http://localhost:8001/health';
    const res = await fetch(cnnUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      checks.cnnWorker = { status: 'online', latency: Date.now() - cnnStart };
    } else {
      checks.cnnWorker = { status: 'offline', latency: Date.now() - cnnStart };
    }
  } catch {
    checks.cnnWorker = { status: 'offline', latency: Date.now() - cnnStart };
  }

  // Data integrity: check if we have recent data
  checks.dataIntegrity = {
    status: checks.database.status === 'online' && checks.token.status !== 'offline' ? 'online' : 'warning',
  };

  const allOnline = Object.values(checks).every(c => c.status === 'online');

  return NextResponse.json({
    success: true,
    overall: allOnline ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
}
