import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const emiten = new URL(request.url).searchParams.get('emiten');
  if (!emiten) {
    return NextResponse.json({ success: false, error: 'Missing ?emiten param' }, { status: 400 });
  }

  const base = `http://localhost:${process.env.PORT || 3000}`;
  try {
    const res = await fetch(`${base}/api/screener?mode=whale&q=${emiten}`);
    const data = await res.json();
    const hit = data?.data?.results?.find((r: any) => r.code === emiten) ?? null;
    return NextResponse.json({ success: true, emiten, found: !!hit, data: hit });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { emitenList, urgencyLevel = 'MEDIUM' } = await request.json();

    if (!emitenList || !Array.isArray(emitenList) || emitenList.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid emiten list' }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.log('[Whale Alert] Telegram credentials missing, skipping alert.');
      return NextResponse.json({ success: true, warning: 'Telegram credentials missing' });
    }

    let urgencyEmoji = '⚠️';
    if (urgencyLevel === 'CRITICAL') urgencyEmoji = '🚨🚨🚨';
    else if (urgencyLevel === 'HIGH') urgencyEmoji = '🔥';

    let message = `${urgencyEmoji} *WHALE ALERT DETECTED* (${urgencyLevel})\n\n`;
    message += `Terdeteksi aktivitas institusional signifikan pada saham berikut:\n\n`;
    
    emitenList.forEach((e) => {
        message += `👉 *${e}*\n`;
    });
    
    message += `\n_Di-generate otomatis oleh ZeroClaw AI_`;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    const data = await response.json();
    return NextResponse.json({ success: true, telegram: data });
  } catch (error: any) {
    console.error('Whale Alert Telegram Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
