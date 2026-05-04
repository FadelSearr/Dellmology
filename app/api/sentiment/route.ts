import { NextRequest, NextResponse } from 'next/server';
import { analyzeSentiment } from '@/lib/sentiment';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const emiten = searchParams.get('emiten') || undefined;
  const zScore = parseFloat(searchParams.get('zScore') || '0');
  const whaleNetValue = parseFloat(searchParams.get('whaleNetValue') || '0');

  try {
    const result = await analyzeSentiment(zScore, whaleNetValue, emiten);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
