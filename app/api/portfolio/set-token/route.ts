import { NextRequest, NextResponse } from 'next/server';
import { saveCarinaToken } from '@/lib/stockbit';

/* ══════════════════════════════════════════════════════════════
   Set Carina Token — For Portfolio Access
   
   Stores the Stockbit Securities (carina) JWT token separately
   from the exodus token used for market data.
   ══════════════════════════════════════════════════════════════ */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    await saveCarinaToken(token);

    // Decode to show expiry
    let expiresAt = '';
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (payload.exp) expiresAt = new Date(payload.exp * 1000).toISOString();
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Carina (portfolio) token saved successfully',
      expires_at: expiresAt,
    }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to save token' },
      { status: 500, headers: corsHeaders }
    );
  }
}
