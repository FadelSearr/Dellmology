import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const HISTORY_FILE = path.join(process.cwd(), 'signal_history.json');

async function getCurrentPrice(emiten: string): Promise<number | null> {
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/stock?emiten=${emiten}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.price || data.price || null;
  } catch { return null; }
}

export async function POST() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return NextResponse.json({ success: true, updated: 0, log: [] });
    }

    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    let updatedCount = 0;
    const log: string[] = [];

    for (const sig of history) {
      if (sig.status !== 'PENDING') continue;

      const currentPrice = await getCurrentPrice(sig.emiten);
      if (!currentPrice) {
        log.push(`SKIP ${sig.emiten}: no price`);
        continue;
      }

      sig.dayHighChecked = currentPrice;

      if (currentPrice >= sig.tp) {
        sig.status = 'TP_HIT';
        const profitPct = (((sig.tp - sig.entry) / sig.entry) * 100).toFixed(1);
        log.push(`TP_HIT ${sig.emiten}: price=${currentPrice} >= tp=${sig.tp} (+${profitPct}%)`);
        updatedCount++;
      } else if (currentPrice <= sig.sl) {
        sig.status = 'SL_HIT';
        const lossPct = (((sig.sl - sig.entry) / sig.entry) * 100).toFixed(1);
        log.push(`SL_HIT ${sig.emiten}: price=${currentPrice} <= sl=${sig.sl} (${lossPct}%)`);
        updatedCount++;
      } else {
        log.push(`OPEN ${sig.emiten}: price=${currentPrice}, tp=${sig.tp}, sl=${sig.sl}`);
      }
    }

    if (updatedCount > 0) {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    }

    return NextResponse.json({ success: true, updated: updatedCount, log });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
