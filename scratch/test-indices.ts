import { fetchYahooPrice } from '../lib/price-sync';

async function test() {
  const indices = ['^JKSE', '^JAKFIN', '^JAKAGRI', '^JAKMINE', '^JAKCONS', '^JAKBIND', '^JAKTRAD'];
  for (const idx of indices) {
    try {
      const p = await fetchYahooPrice(idx);
      console.log(idx, '->', p);
    } catch (e) {
      console.log(idx, '-> ERROR', e.message);
    }
  }
}
test();
