import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { emitenList } = await request.json();

    if (!emitenList || !Array.isArray(emitenList) || emitenList.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid emiten list' }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      // Silently fail if no telegram setup to not break the app
      console.log('[Whale Alert] Telegram credentials missing, skipping alert.');
      return NextResponse.json({ success: true, warning: 'Telegram credentials missing' });
    }

    let message = `🐋 *WHALE ALERT DETECTED* 🐋\n\n`;
    message += `Terdeteksi lonjakan aktivitas bandar (Volume Ratio > 3x) secara signifikan pada saham berikut:\n\n`;
    
    emitenList.forEach((e) => {
        message += `🔥 *${e}*\n`;
    });
    
    message += `\n_Segera cek Dellmology Pro untuk detail momentum dan chart._`;

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
