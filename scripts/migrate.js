import { readFile } from 'node:fs/promises';
import { createPool } from '../server/db.js';

let pool;
try {
  pool = createPool(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
  await pool.query(await readFile(new URL('../db/migrations/001_auth.sql', import.meta.url), 'utf8'));
  console.log('PostgreSQL auth schema is up to date.');
} catch {
  console.error('Migration failed. Check DATABASE_URL, database permissions, and TLS connectivity.');
  process.exitCode = 1;
} finally {
  await pool?.end();
}
