import { NextResponse } from 'next/server';

const SECTORS = [
  { name: 'Finance', proxies: ['BBCA.JK', 'BMRI.JK', 'BBRI.JK'] },
  { name: 'Energy', proxies: ['ADRO.JK', 'PTBA.JK', 'ITMG.JK'] },
  { name: 'Consumer', proxies: ['ICBP.JK', 'INDF.JK', 'UNVR.JK'] },
  { name: 'Basic Ind.', proxies: ['TPIA.JK', 'BRPT.JK', 'INKP.JK'] },
  { name: 'Tech', proxies: ['GOTO.JK', 'ARTO.JK'] },
  { name: 'Property', proxies: ['CTRA.JK', 'BSDE.JK'] },
  { name: 'Infra', proxies: ['TLKM.JK', 'JSMR.JK'] }
];

let cachedData: any = null;
let lastFetch = 0;

export async function GET() {
  if (Date.now() - lastFetch < 5 * 60 * 1000 && cachedData) {
    return NextResponse.json({ success: true, data: cachedData });
  }

  try {
    const results = await Promise.all(
      SECTORS.map(async (sector) => {
        let totalChange = 0;
        let count = 0;
        
        await Promise.all(sector.proxies.map(async (ticker) => {
          try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=2d&interval=1d`;
            const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number) => c != null) || [];
            if (closes.length >= 2) {
              const pct = ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100;
              totalChange += pct;
              count++;
            }
          } catch {
            // Ignore error for single ticker
          }
        }));

        const avgChange = count > 0 ? totalChange / count : 0;
        return {
          name: sector.name,
          changePercent: avgChange,
          status: avgChange > 0.5 ? 'Bullish' : (avgChange < -0.5 ? 'Bearish' : 'Neutral')
        };
      })
    );

    cachedData = results;
    lastFetch = Date.now();

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
