require('dotenv').config({ path: '.env.local' });
const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.TELEGRAM_CHAT_ID;

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN missing in .env.local');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Dellmology Telegram Bot (Chat Oracle) is running...');

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  
  if (allowedChatId && chatId !== allowedChatId) {
    bot.sendMessage(chatId, '⛔ Unauthorized access.');
    return;
  }

  const query = msg.text;
  if (!query) return;
  
  if (query.startsWith('/start')) {
    bot.sendMessage(chatId, 'Halo! Saya Chat Oracle Dellmology.\nKetikkan perintah pencarian saham Anda, contoh: "Cari saham untuk daytrade yang sedang diakumulasi."');
    return;
  }

  const waitMsg = await bot.sendMessage(chatId, '⏳ Oracle sedang memproses perintah...');

  try {
    const res = await fetch('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'nl_to_screener', query }),
    });

    const data = await res.json();

    if (data.success && data.data && data.data.results) {
      const hits = data.data.results.slice(0, 10);
      let responseText = `*Hasil Screener Oracle*\nMode: \`${data.params.mode}\`\n\n`;
      
      if (hits.length === 0) {
        responseText += `Tidak ada saham yang diakumulasi oleh Foreign/Whale dengan kriteria tersebut saat ini.`;
      } else {
        hits.forEach(hit => {
          const sign = hit.changePercent > 0 ? '+' : '';
          const emoji = hit.changePercent > 0 ? '🟢' : (hit.changePercent < 0 ? '🔴' : '⚪');
          responseText += `${emoji} *${hit.code}* - Rp ${hit.price} (${sign}${hit.changePercent}%)\n`;
          if (hit.volumeRatio > 2) responseText += `   ⚡ _Volume Spike_ (VR: ${hit.volumeRatio}x)\n`;
          
          if (hit.reasoning) responseText += `   🧠 *Analisis AI:* ${hit.reasoning}\n`;
          if (hit.entry_strategy) responseText += `   🎯 *Entry Strategy:* ${hit.entry_strategy}\n`;
          responseText += '\n';
        });
      }

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
