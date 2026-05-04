import { NextResponse } from 'next/server';

/* ══════════════════════════════════════════════════════════════
   Heartbeat Monitor
   
   Notifikasi Telegram hanya dikirim saat:
   1. Sistem OFFLINE (>10 menit tanpa heartbeat)
   2. Sistem kembali ONLINE setelah offline (sekali saja)
   
   Tidak mengirim notif berkala saat sistem berjalan normal.
   ══════════════════════════════════════════════════════════════ */

let lastHeartbeat = Date.now();
let wasOffline = false;          // Track apakah sebelumnya offline
let offlineAlertSent = false;    // Sudah kirim alert offline?

const OFFLINE_THRESHOLD = 10 * 60 * 1000; // 10 menit

async function sendTelegram(text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Telegram unavailable
  }
}

export async function GET() {
  const now = Date.now();
  const elapsedMs = now - lastHeartbeat;
  const isOnline = elapsedMs < OFFLINE_THRESHOLD;

  // Kirim alert offline jika belum pernah dikirim
  if (!isOnline && !offlineAlertSent) {
    offlineAlertSent = true;
    wasOffline = true;
    await sendTelegram(
      `🔴 <b>DELLMOLOGY OFFLINE</b>\n\nSistem tidak merespons selama ${Math.round(elapsedMs / 60000)} menit.\nLast heartbeat: ${new Date(lastHeartbeat).toLocaleString('id-ID')}\n\n⚠️ Periksa posisi secara manual!`
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      status: isOnline ? 'online' : 'offline',
      lastHeartbeat: new Date(lastHeartbeat).toISOString(),
      elapsedSeconds: Math.round(elapsedMs / 1000),
      wasOffline,
      message: isOnline ? 'System is alive' : 'DELLMOLOGY OFFLINE — CHECK POSITION MANUALLY!',
    },
  });
}

export async function POST() {
  const previouslyOffline = wasOffline;
  lastHeartbeat = Date.now();

  // Jika sebelumnya offline → kirim SATU notif "kembali online"
  if (previouslyOffline) {
    wasOffline = false;
    offlineAlertSent = false; // Reset agar bisa alert lagi nanti
    await sendTelegram(
      `🟢 <b>DELLMOLOGY ONLINE</b>\n\nSistem kembali aktif pada ${new Date().toLocaleString('id-ID')}`
    );
  }
  // Jika sudah online normal → tidak kirim apa-apa

  return NextResponse.json({
    success: true,
    data: {
      lastHeartbeat: new Date(lastHeartbeat).toISOString(),
      recoveredFromOffline: previouslyOffline,
    },
  });
}
