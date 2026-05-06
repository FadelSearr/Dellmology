import { NextRequest, NextResponse } from 'next/server';
import { fetchWatchlistGroups, fetchWatchlist } from '@/lib/stockbit';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const groups = await fetchWatchlistGroups();
    
    let lists: any[] = [];
    if (groups && groups.length > 0) {
      for (const g of groups) {
        const wData = await fetchWatchlist(g.watchlist_id).catch(e => ({ error: e.message }));
        lists.push({
          group: g,
          data: wData
        });
      }
    }

    return NextResponse.json({
      success: true,
      groups,
      lists
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    });
  }
}
