import { NextResponse } from 'next/server';
import { getPrice } from '@/lib/price-sync';

export async function GET() {
  const bbri = await getPrice('BBRI', true);
  const apln = await getPrice('APLN', true);
  return NextResponse.json({ bbri, apln });
}
