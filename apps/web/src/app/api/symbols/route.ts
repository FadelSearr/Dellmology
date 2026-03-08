import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.toUpperCase() || '';

  try {
    // return distinct symbols from any table we have data for
    const query = `
      SELECT DISTINCT symbol
      FROM daily_prices
      WHERE symbol ILIKE $1
      ORDER BY symbol
      LIMIT 50
    `;
    const like = q ? `${q}%` : '%';
    const result = await db.query(query, [like]);
    const symbols = result.rows.map((r: Record<string, unknown>) => String(r.symbol ?? ''));
    return NextResponse.json({ success: true, symbols });
  } catch (err) {
    console.error('symbols API error', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}