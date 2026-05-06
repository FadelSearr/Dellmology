import { NextRequest, NextResponse } from 'next/server';
import { getSessionValue } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function getToken(): Promise<string> {
  const carinaToken = await getSessionValue('stockbit_carina_token');
  if (carinaToken) return carinaToken;
  const token = await getSessionValue('stockbit_token');
  if (token) return token;
  return process.env.STOCKBIT_JWT_TOKEN || '';
}

export async function GET(_request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 });

  const results: any = {};

  // Stock portfolio - raw response
  try {
    const res = await fetch('https://carina.stockbit.com/portfolio/v2/list', {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        origin: 'https://stockbit.com',
        referer: 'https://stockbit.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const json = await res.json();
    results.stock = {
      status: res.status,
      topLevelKeys: Object.keys(json),
      dataKeys: json.data ? Object.keys(json.data) : 'no data key',
      // Show full structure for first few items
      fullResponse: JSON.stringify(json).slice(0, 5000),
    };
  } catch (err) {
    results.stock = { error: String(err) };
  }

  return NextResponse.json(results);
}
