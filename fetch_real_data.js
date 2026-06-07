const fs = require('fs');

async function fetchStock(emiten) {
  try {
    const res = await fetch(`http://localhost:3000/api/stock?emiten=${emiten}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.error(`Error fetching ${emiten}:`, e.message);
  }
  return null;
}

async function main() {
  const candidates = ['BRMS', 'DOID', 'ESSA', 'ELSA', 'GOTO', 'BUMI', 'BUKA', 'ENRG', 'GJTL', 'PGEO'];
  const results = [];
  
  for (const c of candidates) {
    const data = await fetchStock(c);
    if (data && data.success && data.data) {
      results.push(data.data);
    }
  }
  
  fs.writeFileSync('real_data.json', JSON.stringify(results, null, 2));
  console.log('Saved real_data.json');
}

main();
