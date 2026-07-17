// standalone audit script - no telegram bot polling
const fs = require('fs');
const path = require('path');

const HISTORY_FILE = './signal_history.json';

async function getCurrentPrice(emiten) {
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/stock?emiten=${emiten}`);
    if (!res.ok) { console.log(`[FAIL] ${emiten}: HTTP ${res.status}`); return null; }
    const data = await res.json();
    const price = data.data?.price || data.price || null;
    console.log(`[PRICE] ${emiten}: ${price}`);
    return price;
  } catch(e) { console.log(`[ERR] ${emiten}: ${e.message}`); return null; }
}

async function run() {
  const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
  const history = JSON.parse(raw);
  let updated = false;

  for (const sig of history) {
    if (sig.status !== 'PENDING') continue;
    
    const currentPrice = await getCurrentPrice(sig.emiten);
    if (!currentPrice) { console.log(`[SKIP] ${sig.emiten}: no price`); continue; }

    if (currentPrice >= sig.tp) {
      console.log(`[TP_HIT] ${sig.emiten}: price=${currentPrice} >= tp=${sig.tp}`);
      sig.status = 'TP_HIT';
      updated = true;
    } else if (currentPrice <= sig.sl) {
      console.log(`[SL_HIT] ${sig.emiten}: price=${currentPrice} <= sl=${sig.sl}`);
      sig.status = 'SL_HIT';
      updated = true;
    } else {
      console.log(`[OPEN] ${sig.emiten}: price=${currentPrice}, tp=${sig.tp}, sl=${sig.sl}`);
    }
  }

  if (updated) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    console.log('[SAVED] signal_history.json updated');
  } else {
    console.log('[DONE] No status changes');
  }
}

run();
