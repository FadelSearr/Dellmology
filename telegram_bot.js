require('dotenv').config({ path: '.env.local' });
const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.TELEGRAM_CHAT_ID;
const HISTORY_FILE = path.join(__dirname, 'signal_history.json');

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN missing in .env.local');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Mendaftarkan menu command autocomplete di Telegram
bot.setMyCommands([
  { command: '/start', description: 'Mulai bot dan lihat panduan' },
  { command: '/history', description: 'Lihat ringkasan riwayat sinyal' },
  { command: '/audit', description: 'Cek manual TP/SL sinyal aktif' },
  { command: '/watchlist', description: 'Cek status saham di watchlist (Support Fibonacci)' }
]).catch(console.error);

console.log('🤖 Dellmology Telegram Bot (Chat Oracle) is running...');
console.log('📅 Scheduled signals: 08:30 | 13:30 | 16:30 WIB');
console.log('🔍 Signal audit: 09:00 | 14:00 | 17:00 WIB');

// ══════════════════════════════════════════════════════════
// SIGNAL HISTORY (Gambar 2)
// ══════════════════════════════════════════════════════════

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch { return []; }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function saveSignalToHistory(hits) {
  const history = loadHistory();
  const now = new Date().toISOString();
  for (const hit of hits) {
    const emiten = hit.code || hit.emiten;
    if (!emiten) continue;
    const price = parseFloat(hit.price) || parseFloat(hit.entry) || 0;
    const tp = parseFloat(hit.tp) || Math.round(price * 1.06);
    const sl = parseFloat(hit.sl) || Math.round(price * 0.93);
      let reasoning = null;
      if (hit.reasoning) {
        reasoning = hit.reasoning;
      } else if (hit.bandarSignal) {
        reasoning = `Bandarmology Analysis: ${hit.bandarSignal}. Smart Money Net: ${(hit.smartMoneyLot / 1000000).toFixed(1)}M lot. Foreign Flow: ${hit.foreignStatus || 'NEUTRAL'} (${hit.foreignParticipation ? hit.foreignParticipation.toFixed(1) : 0}% part).`;
      } else {
        reasoning = hit.entry_strategy || 'No reasoning provided';
      }
      
      history.push({
        emiten,
        entry: price,
        tp,
        sl,
        reasoning: reasoning,
      sentAt: now,
      status: 'PENDING',
      dayHighChecked: null,
    });
  }
  saveHistory(history);
}

async function getCurrentPrice(emiten) {
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/stock?emiten=${emiten}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.price || data.price || null;
  } catch { return null; }
}

async function runSignalAudit() {
  try {
    // Delegate audit logic to Next.js API to avoid conflicts
    const res = await fetch('http://127.0.0.1:3000/api/audit', {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`Audit API returned ${res.status}`);

    const result = await res.json();
    const { updated, log } = result;

    if (!allowedChatId) return;

    if (updated > 0) {
      // Build Telegram message from log lines that contain TP_HIT or SL_HIT
      const tpLines = log.filter(l => l.startsWith('TP_HIT'));
      const slLines = log.filter(l => l.startsWith('SL_HIT'));

      let msg = '';
      for (const line of tpLines) {
        // e.g. "TP_HIT ECII: price=160 >= tp=144 (+11.8%)"
        const match = line.match(/TP_HIT (\w+): price=(\d+) .* tp=(\d+) \(([^)]+)\)/);
        if (match) {
          const [, emiten, price, tp, pct] = match;
          msg += `🏆 *SIGNAL TP HIT*\n`;
          msg += `Symbol: *${emiten}*\n`;
          msg += `Harga: Rp${price} ≥ TP: Rp${tp}\n`;
          msg += `Profit: *+${pct}*\n\n`;
        }
      }
      for (const line of slLines) {
        const match = line.match(/SL_HIT (\w+): price=(\d+) .* sl=(\d+) \(([^)]+)\)/);
        if (match) {
          const [, emiten, price, sl, pct] = match;
          msg += `⛔ *SIGNAL SL HIT*\n`;
          msg += `Symbol: *${emiten}*\n`;
          msg += `Harga: Rp${price} ≤ SL: Rp${sl}\n`;
          msg += `Loss: *${pct}*\n\n`;
        }
      }

      if (msg) {
        await bot.sendMessage(allowedChatId, msg.trim(), { parse_mode: 'Markdown' });
      }
    } else {
      await bot.sendMessage(allowedChatId, '✔️ Audit selesai. Tidak ada sinyal yang menyentuh TP atau SL saat ini.');
    }
  } catch (err) {
    console.error('[Audit] Error:', err.message);
    if (allowedChatId) {
      await bot.sendMessage(allowedChatId, `⚠️ Audit gagal: ${err.message}`).catch(() => {});
    }
  }
}


// ══════════════════════════════════════════════════════════
// FORMAT SIGNAL (Gambar 3)
// ══════════════════════════════════════════════════════════

function formatSignalMessage(hit, sessionLabel) {
  const emiten = hit.code || hit.emiten || '?';
  const price = hit.price || 0;
  const tp = hit.tp || Math.round(price * 1.06);
  const sl = hit.sl || Math.round(price * 0.93);

  // Broker data (dari telegramMessage field atau fallback)
  if (hit.telegramMessage) {
    return hit.telegramMessage;
  }

  const sign = hit.changePercent > 0 ? '+' : '';
  const changeEmoji = hit.changePercent > 0 ? '🟢' : (hit.changePercent < 0 ? '🔴' : '⚪');

  let msg = `🇮🇩 *DELLMOLOGY-PRO STOCK SIGNAL* 🇮🇩`;
  if (sessionLabel) msg += `\n_${sessionLabel}_`;
  msg += `\n\nSaham: *${emiten}*`;
  msg += `\nSignal: 🟢 BUY`;
  msg += `\n\n💵 Entry Price: Rp${price}`;
  if (hit.entry_strategy) {
    msg += `\n🎯 TP: Rp${tp}`;
    msg += `\n🛑 SL: Rp${sl}`;
  } else {
    msg += `\n🎯 Take Profit: Rp${tp}`;
    msg += `\n🛑 Stop Loss: Rp${sl}`;
  }
  if (hit.changePercent !== undefined) {
    msg += `\n${changeEmoji} Change: ${sign}${hit.changePercent}%`;
  }
  if (hit.volumeRatio > 2) {
    msg += `\n⚡ Volume Spike: ${hit.volumeRatio}x`;
  }
  if (hit.reasoning) {
    msg += `\n\n🏢 *Analisis AI:*\n${hit.reasoning}`;
  }
  if (hit.entry_strategy) {
    msg += `\n\n🎯 *Entry Strategy:*\n${hit.entry_strategy}`;
  }
  return msg;
}

// ══════════════════════════════════════════════════════════
// FETCH & BROADCAST SIGNAL
// ══════════════════════════════════════════════════════════

async function fetchAndBroadcastSignal(sessionLabel) {
  if (!allowedChatId) {
    console.warn('[Signal] TELEGRAM_CHAT_ID not set, cannot broadcast.');
    return;
  }

  console.log(`[${sessionLabel}] Fetching whale/foreign accumulation signal...`);
  const waitMsg = await bot.sendMessage(allowedChatId,
    `⏳ *${sessionLabel}*\nBandarmologi Scanner aktif — mendeteksi akumulasi Whale & Asing...`,
    { parse_mode: 'Markdown' }
  );

  try {
    // Panggil Whale Screener: hanya saham yang diakumulasi Institutional/Foreign lolos
    // Saham yang dibeli retail/day trader otomatis di-stop oleh screener
    const res = await fetch('http://127.0.0.1:3000/api/screener?mode=whale', {
      signal: AbortSignal.timeout(60000), // whale scan butuh waktu lebih lama
    });

    const data = await res.json();
    const hits = (data?.data?.results || []).slice(0, 5); // max 5 sinyal per sesi

    if (hits.length === 0) {
      await bot.editMessageText(
        `📭 *${sessionLabel}*\n\n` +
        `Tidak ada saham yang terdeteksi akumulasi Whale/Asing saat ini.\n` +
        `_Retail & day trader sudah difilter._`,
        { chat_id: allowedChatId, message_id: waitMsg.message_id, parse_mode: 'Markdown' }
      );
      return;
    }

    // Simpan ke riwayat sebelum broadcast
    saveSignalToHistory(hits);

    await bot.deleteMessage(allowedChatId, waitMsg.message_id).catch(() => {});

    // Header broadcast
    await bot.sendMessage(allowedChatId,
      `📡 *${sessionLabel}*\n` +
      `🐋 *${hits.length} saham diakumulasi Whale/Asing*\n` +
      `_Saham retail & day trader sudah di-stop_`,
      { parse_mode: 'Markdown' }
    );

    for (const hit of hits) {
      const price = hit.price || 0;
      const tp = hit.tp || Math.round(price * 1.06);
      const sl = hit.sl || Math.round(price * 0.93);
      const sign = hit.changePercent > 0 ? '+' : '';
      const changeEmoji = hit.changePercent > 0 ? '🟢' : (hit.changePercent < 0 ? '🔴' : '⚪');

      let msg = `Saham: *${hit.code || hit.emiten}*\n`;
      msg += `Signal: 🟢 BUY\n\n`;
      msg += `💵 Entry Price: Rp${hit.entry ? hit.entry.toLocaleString('id-ID') : price.toLocaleString('id-ID')}\n`;
      msg += `🎯 Take Profit: Rp${tp.toLocaleString('id-ID')}\n`;
      msg += `🛑 Stop Loss: Rp${sl.toLocaleString('id-ID')}\n\n`;

      if (hit.bandarSignal) {
        msg += `🏢 *Bandarmology (IPOT Broker Flow):*\n`;
        msg += `Sinyal Bandar: ${hit.bandarSignal}\n`;
        msg += `Smart Money Net: ${hit.smartMoneyLot > 0 ? '+' : ''}${(hit.smartMoneyLot / 1000000).toFixed(1)}M lot\n`;
        
        if (hit.topBuyers && hit.topBuyers.length > 0) {
          msg += `🟢 *Top Buyer:*\n`;
          for (let b of hit.topBuyers) {
            msg += `  ${b.broker} (${b.name}): +${b.lot.toLocaleString('id-ID')} lot\n`;
          }
        }
        if (hit.topSellers && hit.topSellers.length > 0) {
          msg += `🔴 *Top Seller:*\n`;
          for (let s of hit.topSellers) {
            msg += `  ${s.broker} (${s.name}): -${s.lot.toLocaleString('id-ID')} lot\n`;
          }
        }
        msg += `\n`;
      }

      msg += `📊 *Foreign Flow (IDX):*\n`;
      msg += `Status: ${hit.foreignStatus || '⚪ NEUTRAL'}\n`;
      msg += `Net Asing: Rp${hit.foreignNetVal ? (hit.foreignNetVal / 1000000).toFixed(1) : '0'}M (${hit.foreignNetLot ? hit.foreignNetLot.toLocaleString('id-ID') : '0'} lot)\n`;
      msg += `Partisipasi Asing: ${hit.foreignParticipation ? hit.foreignParticipation.toFixed(1) : '0'}% volume\n`;


      await bot.sendMessage(allowedChatId, msg, { parse_mode: 'Markdown' });
      await new Promise(r => setTimeout(r, 600));
    }
  } catch (err) {
    console.error(`[${sessionLabel}] Error:`, err.message);
    await bot.editMessageText(
      `❌ *${sessionLabel}*\nGagal menghubungi Whale Scanner. Coba lagi nanti.`,
      { chat_id: allowedChatId, message_id: waitMsg.message_id, parse_mode: 'Markdown' }
    ).catch(() => {});
  }
}

// ══════════════════════════════════════════════════════════
// CRON JOBS — JADWAL SINYAL (Gambar 1)
// WIB = UTC+7, jadi jam WIB = jam UTC + 7
// node-cron pakai local system time
// ══════════════════════════════════════════════════════════

// 08:30 WIB — Pagi (Pre-Market Opening)
cron.schedule('30 8 * * 1-5', () => {
  fetchAndBroadcastSignal('🌅 SINYAL PAGI (08:30 WIB)');
}, { timezone: 'Asia/Jakarta' });

// 13:30 WIB — Siang (Mid-Session)
cron.schedule('30 13 * * 1-5', () => {
  broadcastOracleReport('☀️ SINYAL SIANG (13:30 WIB)');
}, { timezone: 'Asia/Jakarta' });

// 16:30 WIB — Sore (Pre-Close)
cron.schedule('30 16 * * 1-5', () => {
  broadcastOracleReport('🌆 SINYAL SORE (16:30 WIB)');
}, { timezone: 'Asia/Jakarta' });

async function broadcastOracleReport(sessionLabel) {
  const waitMsg = await bot.sendMessage(allowedChatId, `⏳ *${sessionLabel}*\nOracle AI sedang menganalisis pasar...`, { parse_mode: 'Markdown' });
  try {
    const res = await fetch('http://127.0.0.1:3000/api/oracle?refresh=true', { signal: AbortSignal.timeout(120000) });
    const data = await res.json();
    const picks = data?.data?.topPicks || [];
    const macro = data?.data?.macroSentiment || 'Market sentiment neutral.';

    if (picks.length === 0) {
      await bot.editMessageText(`❌ *${sessionLabel}*\nGagal mendapatkan rekomendasi Oracle.`, { chat_id: allowedChatId, message_id: waitMsg.message_id, parse_mode: 'Markdown' });
      return;
    }

    let message = `✨ *Dellmology Oracle Report — ${sessionLabel}* ✨\n\n`;
    message += `🌍 *Macro Sentiment:*\n_${macro}_\n\n`;
    message += `🚀 *Top 5 Breakout Picks:*\n\n`;

    picks.forEach((p, i) => {
      const riskEmoji = p.riskLevel === 'Low' ? '🛡️' : p.riskLevel === 'Medium' ? '⚠️' : '🔥';
      message += `${i + 1}. *${p.emiten}* — Prob: ${p.probability}%\n`;
      message += `   ${riskEmoji} Risk: ${p.riskLevel} | RRR: ${p.rewardToRiskRatio}:1\n`;
      message += `   🎯 Entry: ${p.entryStrategy}\n`;
      message += `   🛑 SL: ${p.stopLoss} | ✅ TP: ${p.takeProfit}\n`;
      message += `   💡 Reason: ${p.reasoning}\n\n`;
    });

    // Save to history so audit can track them
    const historyHits = picks.map(p => {
        const entryStr = String(p.entryPrice || '');
        const entryMatch = entryStr.match(/\d+/);
        const tpMatch = String(p.takeProfit || '').match(/\d+/);
        const slMatch = String(p.stopLoss || '').match(/\d+/);
        
        return {
            emiten: p.emiten,
            entry: entryMatch ? parseInt(entryMatch[0], 10) : (p.price || 0),
            tp: tpMatch ? parseInt(tpMatch[0], 10) : 0,
            sl: slMatch ? parseInt(slMatch[0], 10) : 0,
            reasoning: p.reasoning,
            entry_strategy: p.entryStrategy,
            changePercent: p.changePercent || 0
        };
    });
    saveSignalToHistory(historyHits);

    await bot.deleteMessage(allowedChatId, waitMsg.message_id).catch(() => {});
    await bot.sendMessage(allowedChatId, message, { parse_mode: 'Markdown' });
  } catch(err) {
    console.error(`[${sessionLabel}] Error:`, err.message);
    await bot.editMessageText(`❌ *${sessionLabel}*\nTerjadi kesalahan saat menghubungi Oracle AI.`, { chat_id: allowedChatId, message_id: waitMsg.message_id, parse_mode: 'Markdown' });
  }
}

// ══════════════════════════════════════════════════════════
// CRON JOBS — AUDIT WIN/LOSS
// 09:00 | 14:00 | 17:00 WIB
// ══════════════════════════════════════════════════════════

cron.schedule('0 9 * * 1-5', runSignalAudit, { timezone: 'Asia/Jakarta' });
cron.schedule('0 14 * * 1-5', runSignalAudit, { timezone: 'Asia/Jakarta' });
cron.schedule('0 17 * * 1-5', runSignalAudit, { timezone: 'Asia/Jakarta' });

// ══════════════════════════════════════════════════════════
// CRON JOBS — WATCHLIST SYNC & TRIGGER (Fibonacci Support)
// 09:15 | 10:30 | 14:15 WIB
// ══════════════════════════════════════════════════════════

async function runWatchlistCheck() {
  const WATCHLIST_FILE = path.join(__dirname, 'watchlist.json');
  if (!fs.existsSync(WATCHLIST_FILE)) return;
  let watchlist = [];
  try {
    watchlist = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));
  } catch (e) { return; }

  if (watchlist.length === 0) return;
  
  let alerts = [];
  for (const emiten of watchlist) {
    try {
      const res = await fetch(`http://127.0.0.1:3000/api/stock?code=${emiten}`);
      if (!res.ok) continue;
      const json = await res.json();
      if (!json.success || !json.data) continue;
      
      const stock = json.data;
      const price = stock.price;
      
      // Calculate simple Fibonacci based on 52-week High/Low if available, or just mock some support levels if not in API.
      // Usually fib levels are S1, S2, S3 or Fib 0.618, 0.5.
      // Assuming stock object has highs/lows or we approximate a support level:
      // Since we don't have historical high/low in this simple endpoint, we will mock a fibonacci check
      // For real usage, we'd fetch chart data and calculate (High - Low) * 0.618 etc.
      // Let's fetch chart data for High/Low
      const chartRes = await fetch(`http://127.0.0.1:3000/api/chart?emiten=${emiten}&tf=1D`);
      if (!chartRes.ok) continue;
      const chartJson = await chartRes.json();
      const chartData = chartJson.data?.chartData || chartJson.chartData || [];
      
      if (chartData.length > 0) {
        let maxHigh = 0;
        let minLow = 9999999;
        chartData.slice(-60).forEach(d => {
          if (d.high > maxHigh) maxHigh = d.high;
          if (d.low < minLow) minLow = d.low;
        });
        
        const diff = maxHigh - minLow;
        const fib618 = maxHigh - (diff * 0.618); // Support 0.618
        const fib786 = maxHigh - (diff * 0.786); // Support 0.786
        
        // If price is near (within 2%) of Fib 618 or Fib 786 support
        if (price > fib618 * 0.98 && price < fib618 * 1.02) {
          alerts.push(`⭐ *${emiten}* berada di area *Support Fibonacci 0.618* (Rp ${Math.round(fib618)}). Harga saat ini: Rp ${price}. Momentum untuk Rebound?`);
        } else if (price > fib786 * 0.98 && price < fib786 * 1.02) {
          alerts.push(`⭐ *${emiten}* berada di area *Support Fibonacci 0.786* (Rp ${Math.round(fib786)}). Harga saat ini: Rp ${price}. Peluang Buy on Weakness.`);
        }
      }
    } catch (e) {
      console.error('Watchlist check error for', emiten, e.message);
    }
  }

  if (alerts.length > 0 && allowedChatId) {
    const msg = `🔔 *Watchlist Alert (Fibonacci Support)*\n\n` + alerts.join('\n\n');
    bot.sendMessage(allowedChatId, msg, { parse_mode: 'Markdown' });
  }
}

cron.schedule('15 9 * * 1-5', runWatchlistCheck, { timezone: 'Asia/Jakarta' });
cron.schedule('30 10 * * 1-5', runWatchlistCheck, { timezone: 'Asia/Jakarta' });
cron.schedule('15 14 * * 1-5', runWatchlistCheck, { timezone: 'Asia/Jakarta' });


// ══════════════════════════════════════════════════════════
// ON-DEMAND COMMANDS (manual dari Telegram)
// ══════════════════════════════════════════════════════════

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();

  if (allowedChatId && chatId !== allowedChatId) {
    bot.sendMessage(chatId, '⛔ Unauthorized access.');
    return;
  }

  const query = msg.text;
  if (!query) return;

  if (query.startsWith('/start')) {
    bot.sendMessage(chatId,
      `🤖 *Dellmology Oracle Bot*\n\nJadwal sinyal otomatis (Senin–Jumat):\n` +
      `🌅 08:30 WIB — Sinyal Pagi (Pre-Market Opening)\n` +
      `☀️ 13:30 WIB — Sinyal Siang (Mid-Session)\n` +
      `🌆 16:30 WIB — Sinyal Sore (Pre-Close)\n\n` +
      `Atau ketikkan query pencarian saham secara langsung.\n` +
      `Contoh: _"Cari saham yang diakumulasi bandar asing"_`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (query.startsWith('/history')) {
    const history = loadHistory();
    const pending = history.filter(s => s.status === 'PENDING').length;
    const tpHit = history.filter(s => s.status === 'TP_HIT').length;
    const slHit = history.filter(s => s.status === 'SL_HIT').length;
    const expired = history.filter(s => s.status === 'EXPIRED').length;
    const winRate = tpHit + slHit > 0
      ? Math.round((tpHit / (tpHit + slHit)) * 100) : 0;

    bot.sendMessage(chatId,
      `📊 *Riwayat Signal*\n\n` +
      `🟢 TP Hit: ${tpHit}\n` +
      `🔴 SL Hit: ${slHit}\n` +
      `⏳ Pending: ${pending}\n` +
      `⌛ Expired: ${expired}\n\n` +
      `🎯 Win Rate: *${winRate}%*`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (query.startsWith('/audit')) {
    bot.sendMessage(chatId, '🔍 Menjalankan audit signal...');
    await runSignalAudit();
    return;
  }

  if (query.startsWith('/whale')) {
    await fetchAndBroadcastSignal('Manual Whale Scan (Real Market)');
    return;
  }

  if (query.startsWith('/watchlist')) {
    bot.sendMessage(chatId, '⭐ Mengecek status saham di Watchlist...');
    await runWatchlistCheck();
    return;
  }

  // General query → Oracle screener
  const waitMsg = await bot.sendMessage(chatId, '⏳ Oracle sedang memproses perintah...');

  try {
    const res = await fetch('http://127.0.0.1:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'nl_to_screener', query }),
    });

    const data = await res.json();

    if (data.success && data.data && data.data.results) {
      const hits = data.data.results.slice(0, 5);

      if (hits.length === 0) {
        await bot.editMessageText(
          'Tidak ada saham yang diakumulasi oleh Foreign/Whale dengan kriteria tersebut saat ini.',
          { chat_id: chatId, message_id: waitMsg.message_id }
        );
        return;
      }

      const responseText = hits.map(hit => formatSignalMessage(hit)).join('\n\n=======================\n\n');
      await bot.editMessageText(responseText, {
        chat_id: chatId,
        message_id: waitMsg.message_id,
        parse_mode: 'Markdown'
      });
    } else {
      throw new Error('Invalid response from API');
    }
  } catch (error) {
    console.error('Error processing telegram message:', error);
    await bot.editMessageText('❌ Maaf, terjadi kesalahan saat menghubungi Oracle/Screener.', {
      chat_id: chatId,
      message_id: waitMsg.message_id
    });
  }
});
module.exports = { runSignalAudit };
