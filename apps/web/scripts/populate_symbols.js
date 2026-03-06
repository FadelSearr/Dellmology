// seed daily_prices and sample broker_flow data using the web project's dependencies
(async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: 'postgresql://admin:password@localhost:5433/dellmology',
  });

  const symbols = [
    'BBCA', 'ASII', 'TLKM', 'GOTO', 'BMRI', 'BBRI', 'BBNI', 'UNTR', 'INDF', 'ADRO',
  ];

  for (const sym of symbols) {
    try {
      await pool.query(
        `INSERT INTO daily_prices(symbol, date, open, high, low, close, volume)
         VALUES ($1, CURRENT_DATE, 0, 0, 0, 0, 0)
         ON CONFLICT (symbol, date) DO NOTHING`,
        [sym]
      );
    } catch (err) {
      console.error('insert error', sym, err);
    }
  }

  // sample broker_flow data
  const brokers = ['PD', 'RHB', 'CIT', 'IB','PAN'];
  const days = 7;
  for (const sym of symbols) {
    for (let d = 0; d < days; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      for (const br of brokers) {
        const net = Math.floor((Math.random() - 0.5) * 2e7);
        await pool.query(
          `INSERT INTO broker_flow(symbol, broker_code, buy_volume, sell_volume, net_value, time)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT DO NOTHING`,
          [sym, br, Math.abs(net), Math.abs(net), net, date]
        );
      }
    }
  }

  console.log('seed complete');
  await pool.end();
})();
