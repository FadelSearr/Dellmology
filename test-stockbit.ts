process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'mock';

import { fetchOrderbook } from './lib/stockbit';

async function main() {
  try {
    const res = await fetchOrderbook('BBRI');
    console.log("Keys in data:");
    console.log(Object.keys(res.data || {}));
    console.log("Previous Close values:", res.data?.previousclose, res.data?.previousprice, res.data?.previousClose, res.data?.prevClose, res.data?.prev_close);
    console.log("Data:", res.data);
  } catch (e) {
    console.error(e);
  }
}

main();
