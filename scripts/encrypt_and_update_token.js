// Script untuk mengenkripsi JWT dan update ke database
// Jalankan: node scripts/encrypt_and_update_token.js <JWT_TOKEN>

const { Client } = require('pg');
const { encryptSessionToken } = require('../apps/web/src/lib/security/sessionTokenCrypto');
require('dotenv').config({ path: '../../.env' });

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_TOKEN = process.argv[2];

if (!JWT_TOKEN) {
  console.error('Usage: node scripts/encrypt_and_update_token.js <JWT_TOKEN>');
  process.exit(1);
}

(async () => {
  const encrypted = encryptSessionToken(JWT_TOKEN);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(
    `UPDATE config SET value = $1, updated_at = NOW() WHERE key = 'session_token'`,
    [encrypted]
  );
  await client.end();
  console.log('Session token terenkripsi dan diupdate ke database.');
})();
