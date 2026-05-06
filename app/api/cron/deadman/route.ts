import { NextRequest, NextResponse } from 'next/server';
import { sendOfflineAlert } from '@/lib/telegram';

/* ══════════════════════════════════════════════════════════════
   Dead Man's Switch — Vercel Cron Monitor

   Per roadmap: "Buat skrip sederhana di Vercel (Frontend) yang
   mengecek apakah Local Worker masih mengirim data. Jika dalam
   60 detik tidak ada data masuk, kirim notifikasi 'Engine Offline'
   ke Telegram Anda."

   This runs every 5 minutes via Vercel Cron (see vercel.json).
   It checks the heartbeat endpoint, and if engine is offline,
   sends a Telegram alert.
   ══════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // ── Auth guard (CRON_SECRET) ─────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // ── Check Go Engine health ────────────────────────────────
    const engineUrl = process.env.ENGINE_HEALTH_URL || 'http://localhost:8080/health';
    let engineOnline = false;

    try {
      const res = await fetch(engineUrl, {
        signal: AbortSignal.timeout(5000),
      });
      engineOnline = res.ok;
    } catch {
      engineOnline = false;
    }

    // ── Check heartbeat status ────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let heartbeatOnline = false;
    let heartbeatData: Record<string, unknown> = {};

    try {
      const hbRes = await fetch(`${baseUrl}/api/heartbeat`, {
        signal: AbortSignal.timeout(5000),
      });
      if (hbRes.ok) {
        const hbJson = await hbRes.json();
        heartbeatData = hbJson.data || {};
        heartbeatOnline = heartbeatData.status === 'online';
      }
    } catch {
      heartbeatOnline = false;
    }

    const isOffline = !engineOnline || !heartbeatOnline;

    // ── Send Telegram alert if offline ────────────────────────
    if (isOffline) {
      await sendOfflineAlert();
    }

    return NextResponse.json({
      success: true,
      data: {
        engineOnline,
        heartbeatOnline,
        overallStatus: isOffline ? 'OFFLINE' : 'ONLINE',
        alertSent: isOffline,
        heartbeat: heartbeatData,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Dead man switch check failed',
      },
      { status: 500 }
    );
  }
}
