import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const JOURNAL_FILE = path.join(process.cwd(), 'signal_history.json');

export async function GET() {
  try {
    if (!fs.existsSync(JOURNAL_FILE)) {
      return NextResponse.json({ success: true, data: [] });
    }
    const data = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf-8'));
    
    // Map data to match UI expectations
    const formattedData = data.map((d: any, index: number) => ({
      id: index,
      emiten: d.emiten,
      entry: d.entry,
      tp: d.tp,
      sl: d.sl,
      status: d.status === 'TP_HIT' ? 'TP' : d.status === 'SL_HIT' ? 'SL' : 'OPEN',
      date: d.sentAt ? d.sentAt.split('T')[0] : new Date().toISOString().split('T')[0],
      reason: d.reasoning || d.entry_strategy || 'Oracle Signal'
    }));

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) });
  }
}

