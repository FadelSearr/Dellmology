import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooHistory } from '@/lib/yahoo-fallback';
import { sendCriticalAlert } from '@/lib/telegram';

/* ══════════════════════════════════════════════════════════════
   Nightly Data Reconciliation — Dellmology Pro

   Per roadmap: "Setiap pukul 20:00 (setelah data resmi End-of-Day
   keluar), buat script otomatis untuk membandingkan total volume di
   database Anda dengan data resmi dari IDX. Jika selisihnya > 1%,
   berikan bendera merah."

   Endpoint: GET /api/reconcile?symbols=BBRI,BBCA,ANTM
   Protected by CRON_SECRET header.
   ══════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic';

const DEFAULT_SYMBOLS = ['BBRI', 'BBCA', 'ANTM', 'TLKM', 'GOTO'];

// ── Supabase helper (direct REST) ────────────────────────────
async function fetchSupabaseVolume(symbol: string, date: string): Promise<number | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const endpoint = `${url}/rest/v1/running_trades?select=volume&emiten=eq.${symbol}&time=gte.${date}T00:00:00&time=lte.${date}T23:59:59`;
    const res = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const rows: { volume: number }[] = await res.json();
    return rows.reduce((sum, r) => sum + (r.volume || 0), 0);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  // ── Auth guard (CRON_SECRET) ─────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');
  const symbols = symbolsParam
    ? symbolsParam.split(',').map(s => s.trim().toUpperCase())
    : DEFAULT_SYMBOLS;

  const today = new Date().toISOString().split('T')[0];
  const results: {
    symbol: string;
    dbVolume: number | null;
    yahooVolume: number | null;
    deviationPercent: number | null;
    status: 'ok' | 'mismatch' | 'no_data';
  }[] = [];

  let hasMismatch = false;

  for (const symbol of symbols) {
    // Fetch from our DB
    const dbVolume = await fetchSupabaseVolume(symbol, today);

    // Fetch from Yahoo Finance (authoritative source)
    const yahooData = await fetchYahooHistory(symbol, '5d', '1d');
    const todayBar = yahooData.find((d: { time: string }) => d.time === today);
    const yahooVolume = todayBar ? (todayBar as { volume: number }).volume : null;

    let deviationPercent: number | null = null;
    let status: 'ok' | 'mismatch' | 'no_data' = 'no_data';

    if (dbVolume != null && yahooVolume != null && yahooVolume > 0) {
      deviationPercent = Math.abs((dbVolume - yahooVolume) / yahooVolume) * 100;
      deviationPercent = parseFloat(deviationPercent.toFixed(2));
      status = deviationPercent > 1 ? 'mismatch' : 'ok';
      if (status === 'mismatch') hasMismatch = true;
    }

    results.push({ symbol, dbVolume, yahooVolume, deviationPercent, status });
  }

  // ── Send Telegram alert if mismatch found ─────────────────
  if (hasMismatch) {
    const mismatchSymbols = results
      .filter(r => r.status === 'mismatch')
      .map(r => `${r.symbol} (${r.deviationPercent}%)`)
      .join(', ');

    await sendCriticalAlert({
      emiten: '',
      type: 'ENGINE_OFFLINE', // reuse existing type for data integrity
      details: `🔴 DATA INTEGRITY WARNING\n\nVolume mismatch detected for: ${mismatchSymbols}\nDate: ${today}\n\nRecommended: Re-fetch data for flagged symbols.`,
    });
  }

  return NextResponse.json({
    success: true,
    date: today,
    overall: hasMismatch ? 'mismatch' : 'ok',
    results,
    checkedAt: new Date().toISOString(),
  });
}
