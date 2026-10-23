import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getPool, query } from '../server/db.js';

// Exercise the running app without truncating any tables or sending real email.
const base = process.env.SMOKE_BASE_URL || 'http://localhost:5173';
const email = `neon-smoke-${randomBytes(12).toString('hex')}@example.invalid`;
const password = randomBytes(24).toString('hex');
let userId;
try {
  const { rows } = await query(`INSERT INTO users(name, email, password, email_verified)
    VALUES ('Database smoke test', $1, $2, 1) RETURNING id`, [email, await bcrypt.hash(password, 12)]);
  userId = rows[0].id;
  console.log('PASS: database insert through DATABASE_URL');

  const login = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200, 'Login must return HTTP 200');
  const user = await login.json();
  assert.equal(user.success, true);
  assert.equal(user.user.id, userId);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie?.startsWith('school_session='));
  console.log('PASS: HTTP login reads the database and issues a session cookie');

  const session = await fetch(`${base}/api/session`, { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.email, email);
  console.log('PASS: HTTP session retrieves the signed-in user');

  const logout = await fetch(`${base}/api/logout`, {
    method: 'POST', headers: { Cookie: cookie, Origin: new URL(base).origin },
  });
  assert.equal(logout.status, 200);
  const expired = await fetch(`${base}/api/session`, { headers: { Cookie: cookie } });
  assert.equal(expired.status, 401);
  console.log('PASS: HTTP logout revokes the database session');
} catch (error) {
  console.error('FAIL: PostgreSQL end-to-end smoke test', { code: error.code || error.name });
  process.exitCode = 1;
} finally {
  try {
    if (userId) await query('DELETE FROM users WHERE id = $1 AND email = $2', [userId, email]);
    const key = createHash('sha256').update(`email:${email}:login`).digest('hex');
    await query('DELETE FROM auth_limits WHERE key = $1', [key]);
    console.log('Removed smoke-test fixtures.');
  } catch {
    console.error('Smoke-test cleanup failed.');
    process.exitCode = 1;
  }
  await getPool().end();
}
