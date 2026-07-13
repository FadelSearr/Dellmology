process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'mock';

import('./lib/price-sync.ts').then(async ({ getPrice }) => {
  const data = await getPrice('BBRI', true);
  console.log(data);
}).catch(console.error);
