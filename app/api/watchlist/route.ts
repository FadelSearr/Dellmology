import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const WATCHLIST_FILE = path.join(process.cwd(), 'watchlist.json');

export async function GET() {
  try {
    if (!fs.existsSync(WATCHLIST_FILE)) {
      return NextResponse.json({ success: true, data: [] });
    }
    const data = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf-8'));
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { emiten } = await req.json();
    if (!emiten) return NextResponse.json({ success: false, error: 'emiten required' }, { status: 400 });

    let data = [];
    if (fs.existsSync(WATCHLIST_FILE)) {
      data = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf-8'));
    }

    if (!data.includes(emiten)) {
      data.push(emiten);
      fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(data, null, 2));
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const emiten = searchParams.get('emiten');
    if (!emiten) return NextResponse.json({ success: false, error: 'emiten required' }, { status: 400 });

    if (fs.existsSync(WATCHLIST_FILE)) {
      let data = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf-8'));
      data = data.filter((e: string) => e !== emiten);
      fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(data, null, 2));
      return NextResponse.json({ success: true, data });
    }
    return NextResponse.json({ success: true, data: [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
