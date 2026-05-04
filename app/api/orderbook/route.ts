import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderbook } from '@/lib/stockbit';

export interface OrderBookLevel {
  price: number;
  volume: number;
  isIceberg: boolean;
}

export interface OrderBookResponse {
  bids: OrderBookLevel[];
  offers: OrderBookLevel[];
  timestamp: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const emiten = searchParams.get('emiten');
  
  if (!emiten) {
    return NextResponse.json({ success: false, error: 'emiten is required' }, { status: 400 });
  }

  try {
    const obData = await fetchOrderbook(emiten);
    
    if (!obData || !obData.data) {
      throw new Error('No orderbook data found');
    }

    const rawBids = obData.data.bid || [];
    const rawOffers = obData.data.offer || [];

    // Map to our OrderBookLevel format
    const bids: OrderBookLevel[] = rawBids.map(b => {
      const vol = parseInt(b.volume) || 0;
      return {
        price: parseInt(b.price) || 0,
        volume: vol,
        isIceberg: vol > 50000 // Flag as iceberg if > 50k lots
      };
    }).filter(b => b.price > 0);

    const offers: OrderBookLevel[] = rawOffers.map(o => {
      const vol = parseInt(o.volume) || 0;
      return {
        price: parseInt(o.price) || 0,
        volume: vol,
        isIceberg: vol > 50000
      };
    }).filter(o => o.price > 0);

    // Sort properly: highest bid first, lowest offer first
    bids.sort((a, b) => b.price - a.price);
    offers.sort((a, b) => a.price - b.price);

    return NextResponse.json({
      success: true,
      data: {
        bids,
        offers,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Orderbook API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
