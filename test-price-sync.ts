process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'mock';

import { getPrice } from './lib/price-sync';

async function main() {
  const data = await getPrice('BBRI', true);
  console.log(data);
}

main();
