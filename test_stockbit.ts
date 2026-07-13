import { fetchMarketDetector } from './lib/stockbit';
fetchMarketDetector('BBCA', '2026-07-10', '2026-07-10')
  .then(x => console.log(Object.keys(x.data || {})))
  .catch(console.error);
