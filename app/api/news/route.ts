import { NextRequest, NextResponse } from 'next/server';
import { getNewsSentiment } from '@/lib/news-ingest';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rateLimitResponse = rateLimit(request, 60, 60);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const emiten = searchParams.get('emiten');

  if (!emiten) {
    return NextResponse.json({ success: false, error: 'emiten is required' }, { status: 400 });
  }

  try {
    const data = await getNewsSentiment([emiten]);
    return NextResponse.json({ success: true, data: data[0] || null });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
