import { NextRequest, NextResponse } from 'next/server';
import { generateOraclePicks } from '@/lib/ai-oracle';
import { getSessionValue, upsertSession } from '@/lib/supabase';
import { rateLimit } from '@/lib/rateLimit';

// The Oracle is expensive and AI takes time. Cache results daily.
const CACHE_KEY = 'oracle_daily_picks';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(request: NextRequest) {
  // Rate limiting to prevent abuse
  const limitRes = rateLimit(request, 5, 60);
  if (limitRes) return limitRes;

  try {
    // 1. Check cache first
    const cachedData = await getSessionValue(CACHE_KEY);
    if (cachedData) {
      try {
        const parsedCache = JSON.parse(cachedData);
        if (Date.now() - parsedCache.timestamp < CACHE_TTL_MS) {
          return NextResponse.json({ success: true, data: parsedCache.data, cached: true });
        }
      } catch (e) {
        // Cache invalid, proceed
      }
    }

    // 2. Fetch the watchlist data to analyze
    // We fetch from the screener API directly (internal call)
    const url = new URL(request.url);
    const screenerUrl = `${url.origin}/api/screener?mode=watchlist`;
    const screenerRes = await fetch(screenerUrl, {
      headers: {
        // Forward headers to maintain auth context if needed
        cookie: request.headers.get('cookie') || '',
      }
    });

    if (!screenerRes.ok) {
      throw new Error('Failed to fetch watchlist data for Oracle');
    }

    const screenerData = await screenerRes.json();
    const watchlist = screenerData.results || [];

    if (watchlist.length < 5) {
      return NextResponse.json({
        success: false,
        error: 'Not enough stocks in watchlist. Please add at least 5 stocks.'
      }, { status: 400 });
    }

    // 3. Generate picks using Gemini
    const oracleResult = await generateOraclePicks(watchlist);

    if (!oracleResult) {
      throw new Error('Oracle failed to generate valid analysis');
    }

    // 4. Cache the successful result
    const cachePayload = {
      timestamp: Date.now(),
      data: oracleResult
    };
    await upsertSession(CACHE_KEY, JSON.stringify(cachePayload), new Date(Date.now() + CACHE_TTL_MS));

    return NextResponse.json({ success: true, data: oracleResult, cached: false });

  } catch (error: any) {
    console.error('Oracle Route Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
