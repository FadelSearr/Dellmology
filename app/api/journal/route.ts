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
    
    const sectors = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'app/config/sectors.json'), 'utf-8'));
    
    // Map data to match UI expectations
    const formattedData = data.map((d: any, index: number) => ({
      id: index,
      emiten: d.emiten,
      entry: d.entry,
      tp: d.tp,
      sl: d.sl,
      sector: sectors[d.emiten] || 'Lainnya',
      status: d.status === 'TP_HIT' ? 'TP' : d.status === 'SL_HIT' ? 'SL' : d.status === 'EXPIRED' ? 'EXPIRED' : 'OPEN',
      date: d.sentAt ? d.sentAt.split('T')[0] : new Date().toISOString().split('T')[0],
      reason: d.reasoning || d.entry_strategy || 'Oracle Signal'
    }));

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');
    if (idParam === null) return NextResponse.json({ success: false, error: 'ID is required' });

    const id = parseInt(idParam, 10);
    if (!fs.existsSync(JOURNAL_FILE)) {
      return NextResponse.json({ success: false, error: 'No history found' });
    }

    const data = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf-8'));
    if (id >= 0 && id < data.length) {
      data.splice(id, 1);
      fs.writeFileSync(JOURNAL_FILE, JSON.stringify(data, null, 2));
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, error: 'Item not found' });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) });
  }
}

