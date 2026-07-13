/* ══════════════════════════════════════════════════════════════
   Dellmology Pro — Telegram Notification Service
   
   Per roadmap: "Send alerts to phone when important signals appear"
   + Heartbeat monitor ("Ping every 5 minutes")
   ══════════════════════════════════════════════════════════════ */

const TELEGRAM_API = 'https://api.telegram.org/bot';

function getBotConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  return { token, chatId };
}

async function sendTelegramMessage(text: string, parseMode = 'HTML') {
  const config = getBotConfig();
  if (!config) {
    console.warn('Telegram not configured - skipping notification');
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_API}${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error('Telegram send failed:', error);
    return false;
  }
}

// ── Signal Alert ─────────────────────────────────────────────
export async function sendSignalAlert(params: {
  emiten: string;
  signal: string;
  ups: number;
  confidence: string;
  topBroker: string;
  netValue: number;
  price: number;
  zScore: number;
}) {
  const emoji = params.ups >= 80 ? '🟢' : params.ups >= 60 ? '🟡' : '🔴';
  const netSign = params.netValue >= 0 ? '+' : '';
  const netFormatted = (Math.abs(params.netValue) / 1e9).toFixed(1);

  const text = `
${emoji} <b>DELLMOLOGY SIGNAL</b> ${emoji}

📊 <b>${params.emiten}</b> — Rp ${params.price.toLocaleString()}
🎯 Signal: <b>${params.signal.toUpperCase()}</b>
⚡ UPS: <b>${params.ups}/100</b> (${params.confidence})

👤 Top Broker: ${params.topBroker} (${netSign}${netFormatted}B)
📈 Z-Score: ${params.zScore.toFixed(1)}

⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
  `.trim();

  return sendTelegramMessage(text);
}

// ── Critical Alert (Kill-Switch) ─────────────────────────────
export async function sendCriticalAlert(params: {
  emiten: string;
  type: 'ROC_SPIKE' | 'IHSG_CRASH' | 'TOKEN_EXPIRED' | 'ENGINE_OFFLINE';
  details: string;
}) {
  const text = `
🚨🚨 <b>CRITICAL ALERT</b> 🚨🚨

⚠️ Type: <b>${params.type}</b>
${params.emiten ? `📊 Emiten: <b>${params.emiten}</b>` : ''}
📝 ${params.details}

🔒 All buy signals SUSPENDED for this emiten.
⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
  `.trim();

  return sendTelegramMessage(text);
}

// ── Heartbeat Ping ───────────────────────────────────────────
// Per roadmap: "Send ping every 5 min, if no ping in 10 min, alert OFFLINE"
export async function sendHeartbeat() {
  return sendTelegramMessage('🫀 DELLMOLOGY HEARTBEAT — Engine Online');
}

// ── Engine Offline Alert ─────────────────────────────────────
export async function sendOfflineAlert() {
  return sendTelegramMessage(
    '🔴🔴 <b>DELLMOLOGY OFFLINE</b> 🔴🔴\n\n' +
    '⚠️ Engine has not sent heartbeat in 10 minutes!\n' +
    '📱 CHECK POSITION MANUALLY!\n\n' +
    `⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
  );
}

// ── Daily Summary ────────────────────────────────────────────
export async function sendDailySummary(params: {
  topSignals: { emiten: string; ups: number; signal: string }[];
  marketRegime: string;
  ihsgChange: number;
}) {
  const signalLines = params.topSignals
    .map((s, i) => `${i + 1}. <b>${s.emiten}</b> — UPS ${s.ups} (${s.signal})`)
    .join('\n');

  const text = `
📋 <b>DELLMOLOGY DAILY SUMMARY</b>

📈 Market: <b>${params.marketRegime}</b>
${params.ihsgChange >= 0 ? '🟢' : '🔴'} IHSG: ${params.ihsgChange >= 0 ? '+' : ''}${params.ihsgChange.toFixed(2)}%

🏆 <b>Top Signals Today:</b>
${signalLines || 'No strong signals detected'}

⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
  `.trim();

  return sendTelegramMessage(text);
}

// ── Anti-Spam Cooldown ───────────────────────────────────────
const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes between same alerts

function canSendAlert(emiten: string, type: string): boolean {
  const key = `${emiten}:${type}`;
  const lastSent = alertCooldown.get(key) || 0;
  if (Date.now() - lastSent < COOLDOWN_MS) return false;
  alertCooldown.set(key, Date.now());
  return true;
}

// ── Anomaly Alert (single) ───────────────────────────────────
export async function sendAnomalyAlert(params: {
  emiten: string;
  type: string;
  emoji: string;
  title: string;
  message: string;
  data?: Record<string, string | number | boolean>;
}) {
  if (!canSendAlert(params.emiten, params.type)) return false;
  
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  let text = `${params.emoji} <b>${params.title}</b>\n`;
  text += `📌 <b>${params.emiten}</b> | ${time}\n\n`;
  text += `${params.message}\n`;

  if (params.data) {
    text += `\n<code>`;
    for (const [key, value] of Object.entries(params.data)) {
      text += `${key}: ${value}\n`;
    }
    text += `</code>`;
  }

  text += `\n🔗 <i>Dellmology Pro — Live Alert</i>`;
  return sendTelegramMessage(text);
}

// ── Batch Alert Processor ────────────────────────────────────
// Call from stock/route.ts after all analysis engines finish
export async function processAlerts(params: {
  emiten: string;
  zScore: number;
  spoofingAlert: boolean;
  washSaleAlert: boolean;
  icebergDetected: boolean;
  icebergBroker: string;
  concentrationLabel: string;
  concentrationTopBroker: string;
  upperShadowAlert: boolean;
  mfiDivergence: boolean;
  mfiLabel: string;
  mfi: number;
  killSwitchActive: boolean;
  price: number;
  changePercent: number;
}): Promise<void> {
  const e = params.emiten;

  // 1. Whale Z-Score
  if (params.zScore > 2.5) {
    sendAnomalyAlert({
      emiten: e, type: 'whale_accum', emoji: '🐋',
      title: 'WHALE ACCUMULATION',
      message: `Volume anomaly! Z-Score ${params.zScore.toFixed(2)} menandakan akumulasi masif.`,
      data: { 'Z-Score': params.zScore.toFixed(2), Price: `Rp ${params.price.toLocaleString()}`, Change: `${params.changePercent.toFixed(2)}%` },
    }).catch(() => {});
  } else if (params.zScore < -2.5) {
    sendAnomalyAlert({
      emiten: e, type: 'whale_dist', emoji: '🐋🔴',
      title: 'WHALE DISTRIBUTION',
      message: `Z-Score ${params.zScore.toFixed(2)} menandakan distribusi besar-besaran.`,
      data: { 'Z-Score': params.zScore.toFixed(2), Price: `Rp ${params.price.toLocaleString()}` },
    }).catch(() => {});
  }

  // 2. Spoofing
  if (params.spoofingAlert) {
    sendAnomalyAlert({
      emiten: e, type: 'spoofing', emoji: '🚨',
      title: 'SPOOFING ALERT',
      message: 'Fake Bid Wall terdeteksi saat harga turun. Kemungkinan jebakan.',
    }).catch(() => {});
  }

  // 3. Wash Sale
  if (params.washSaleAlert) {
    sendAnomalyAlert({
      emiten: e, type: 'wash_sale', emoji: '⚠️',
      title: 'WASH SALE DETECTED',
      message: 'Volume besar tapi net akumulasi sangat kecil. Kemungkinan gorengan.',
    }).catch(() => {});
  }

  // 4. Iceberg Order
  if (params.icebergDetected) {
    sendAnomalyAlert({
      emiten: e, type: 'iceberg', emoji: '🧊',
      title: 'STEALTH ACCUMULATION',
      message: `Pola Iceberg Order terdeteksi oleh ${params.icebergBroker}. Institusi menyamarkan akumulasi.`,
      data: { Broker: params.icebergBroker },
    }).catch(() => {});
  }

  // 5. Concentration
  if (params.concentrationLabel === 'Artificial Liquidity Warning') {
    sendAnomalyAlert({
      emiten: e, type: 'concentration', emoji: '🛡️',
      title: 'ARTIFICIAL LIQUIDITY',
      message: `${params.concentrationTopBroker} menguasai mayoritas volume. Likuiditas buatan.`,
    }).catch(() => {});
  }

  // 6. Upper Shadow (Notification disabled per user request, only visible in dashboard)
  // if (params.upperShadowAlert) { ... }

  // 7. MFI Divergence
  if (params.mfiDivergence) {
    sendAnomalyAlert({
      emiten: e, type: 'mfi_div', emoji: '📊',
      title: 'MFI DIVERGENCE',
      message: params.mfiLabel,
      data: { MFI: params.mfi.toFixed(0) },
    }).catch(() => {});
  }

  // 8. Kill Switch
  if (params.killSwitchActive) {
    sendAnomalyAlert({
      emiten: e, type: 'kill_switch', emoji: '🛑',
      title: 'KILL SWITCH ACTIVATED',
      message: 'Penurunan tajam terdeteksi. Semua sinyal beli dinonaktifkan.',
      data: { Price: `Rp ${params.price.toLocaleString()}`, Drop: `${params.changePercent.toFixed(2)}%` },
    }).catch(() => {});
  }
}
