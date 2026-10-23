import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { randomBytes, generateKeyPairSync, sign } from 'node:crypto';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { OAuth2Client } from 'google-auth-library';

// Use only a separate disposable database, never DATABASE_URL from the app's env files.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must explicitly select an isolated database ending in _test.');
}
const email = `browser-${randomBytes(10).toString('hex')}@example.test`;
const password = 'Browser account password 123!';
const changedPassword = 'Changed browser password 456!';
const emails = [], dialogs = [], runtimeErrors = [];
let browser, page, context, api, vite, query, getPool;
const realFetch = globalThis.fetch;
const envBefore = { ...process.env };
const base = 'http://localhost:5174';
before(async () => {
  process.env.DATABASE_URL = testUrl;
  process.env.APP_URL = base;
  process.env.MAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 'test-only';
  process.env.MAIL_FROM = 'School Hub <test@example.test>';
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.VITE_GOOGLE_CLIENT_ID;
  ({ query, getPool } = await import('../server/db.js'));
  for(const name of (await readdir(new URL('../db/migrations/',import.meta.url))).sort()) await query(await readFile(new URL(`../db/migrations/${name}`,import.meta.url),'utf8'));
  globalThis.fetch = (url, options) => {
    if (url === 'https://api.resend.com/emails') {
      emails.push(JSON.parse(options.body));
      return Promise.resolve(new Response('{"id":"mock-mail"}', { status: 200 }));
    }
    return realFetch(url, options);
  };
  const { default: handler } = await import('../server/handler.js');
  api = createServer(handler);
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  vite = await createViteServer({
    configFile: false, root: process.cwd(), plugins: [react()],
    define: { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify('') },
    server: { host: '127.0.0.1', port: 5174, strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${api.address().port}` } } },
    logLevel: 'error',
  });
  await vite.listen();
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  context = await browser.newContext();
  page = await context.newPage();
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
});
after(async () => {
  await browser?.close();
  await vite?.close();
  if (api) await new Promise(resolve => api.close(resolve));
  globalThis.fetch = realFetch;
  if (query) {
    await query('DELETE FROM users WHERE email = $1', [email]);
    await getPool().end();
  }
  for (const key of ['DATABASE_URL','APP_URL','RESEND_API_KEY','MAIL_FROM','MAIL_PROVIDER','GOOGLE_CLIENT_ID','VITE_GOOGLE_CLIENT_ID']) {
    if (envBefore[key] === undefined) delete process.env[key]; else process.env[key] = envBefore[key];
  }
});
async function waitResponse(action, trigger) {
  const pending = page.waitForResponse(response => response.url().endsWith(`/api/${action}`));
  await trigger();
  const response = await pending.catch(error => { console.error('Browser request diagnostics:', { action, url: page.url().split('?')[0], lastDialog: dialogs.at(-1) }); throw error; });
  await page.waitForTimeout(100);
  return response;
}
async function signIn(value = password) {
  await page.goto(base);
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(value);
  return waitResponse('login', () => page.getByRole('button', { name: 'Sign in', exact: true }).click());
}

test('login and account browser flows', async t => {
  await t.test('login renders; required and email validation prevent empty/malformed submissions', async () => {
    await page.goto(base);
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    assert.equal(await page.title(), 'School Hub');
    assert.equal(await page.locator('link[rel=icon]').getAttribute('href'), '/school-hub.svg');
    let requests = 0;
    const count = req => { if (req.url().endsWith('/api/login')) requests++; };
    page.on('request', count);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    assert.equal(await page.locator('input[name=email]').evaluate(el => el.validity.valueMissing), true);
    await page.locator('input[name=email]').fill('not-an-email');
    await page.locator('input[name=password]').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    assert.equal(await page.locator('input[name=email]').evaluate(el => el.validity.typeMismatch), true);
    assert.equal(requests, 0);
    page.off('request', count);
  });
  await t.test('password visibility and theme toggle work and persist', async () => {
    assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'password');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    const theme = await page.evaluate(() => localStorage.getItem('theme'));
    await page.reload();
    assert.equal(await page.evaluate(() => localStorage.getItem('theme')), theme);
    assert.equal(await page.locator('.google-login-wrapper').count(), 0);
  });
  await t.test('network failure reports an error and allows retry', async () => {
    await page.route('**/api/login', route => route.abort());
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.signin-button').disabled);
    await page.getByRole('alert').getByText('Unable to connect to the server. Please try again.').waitFor();
    await page.unroute('**/api/login');
  });
  await t.test('signup, resend, bad verification and successful verification work', async () => {
    await page.getByRole('link', { name: 'Create an account' }).click();
    await page.waitForURL(`${base}/signup`);
    await page.getByPlaceholder('First name').fill('Browser');
    await page.getByPlaceholder('Last name').fill('Student');
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill(password);
    await page.locator('input[name=confirmPassword]').fill(password);
    assert.equal((await waitResponse('register', () => page.getByRole('button', { name: 'Create account', exact: true }).click())).status(), 200);
    await page.getByPlaceholder('Enter 6-digit code').waitFor();
    await page.getByPlaceholder('Enter 6-digit code').fill('000000');
    assert.equal((await waitResponse('verify-email', () => page.getByRole('button', { name: 'Verify email', exact: true }).click())).status(), 400);
    assert.equal((await waitResponse('resend-verification', () => page.getByRole('button', { name: 'Resend verification code' }).click())).status(), 200);
    const code = emails.at(-1).text.match(/\b\d{6}\b/)[0];
    await page.getByPlaceholder('Enter 6-digit code').fill(code);
    assert.equal((await waitResponse('verify-email', () => page.getByRole('button', { name: 'Verify email', exact: true }).click())).status(), 200);
    await page.waitForURL(`${base}/`);
  });
  await t.test('invalid credentials are rejected; loading prevents duplicate submissions', async () => {
    assert.equal((await signIn('Wrong password 123')).status(), 401);
    await page.getByRole('alert').getByText('Invalid email or password.').waitFor();
    let requests = 0;
    await page.route('**/api/login', async route => {
      requests++;
      await new Promise(resolve => setTimeout(resolve, 300));
      await route.continue();
    });
    await page.locator('input[name=password]').fill(password);
    const pending = page.waitForResponse(r => r.url().endsWith('/api/login'));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Signing in…' }).isDisabled(), true);
    await pending;
    await page.waitForURL(`${base}/dashboard`);
    assert.equal(requests, 1);
    await page.unroute('**/api/login');
  });
  await t.test('session cookie is HttpOnly; refresh keeps access; logout revokes access', async () => {
    const cookie = (await context.cookies()).find(c => c.name === 'school_session');
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Lax');
    await page.reload();
    await page.locator('.sh-app').waitFor();
    assert.ok(page.url().endsWith('/dashboard'));
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.waitForURL(`${base}/`);
    const response = await page.request.get(`${base}/api/session`);
    assert.equal(response.status(), 401);
  });
  await t.test('forging localStorage does not bypass protected routes', async () => {
    await page.evaluate(() => localStorage.setItem('isAuthenticated', 'true'));
    await page.goto(`${base}/dashboard`);
    await page.waitForURL(`${base}/`);
    assert.equal(await page.evaluate(() => localStorage.getItem('isAuthenticated')), null);
  });
  await t.test('forgot-password, new-password confirmation and reset invalidate the old password', async () => {
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await page.waitForURL(`${base}/forgot-password`);
    await page.getByRole('button', { name: 'Send reset link' }).waitFor();
    await page.getByPlaceholder('name@example.com').fill(email);
    assert.equal(await page.locator('input[type=email]').evaluate(el => el.checkValidity()), true);
    assert.equal((await waitResponse('forgot-password', () => page.getByRole('button', { name: 'Send reset link' }).click())).status(), 200);
    const token = emails.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
    await page.goto(`${base}/reset-password?token=${token}`);
    await page.getByPlaceholder('New password', { exact: true }).fill(changedPassword);
    await page.getByPlaceholder('Confirm new password', { exact: true }).fill('Mismatch password!');
    await page.locator('button[type=submit]').click();
    await page.getByRole('alert').getByText('Passwords do not match.').waitFor();
    await page.getByPlaceholder('Confirm new password', { exact: true }).fill(changedPassword);
    assert.equal((await waitResponse('reset-password', () => page.locator('button[type=submit]').click())).status(), 200);
    await page.waitForURL(`${base}/`);
    assert.equal((await signIn(password)).status(), 401);
    assert.equal((await signIn(changedPassword)).status(), 200);
    await page.waitForURL(`${base}/dashboard`);
  });
  await t.test('support handles Formspree success and failure without sending real messages', async () => {
    await page.goto(`${base}/support`);
    await page.route('https://formspree.io/f/xgaawjzg', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await page.getByLabel('Your name').fill('Test');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Message', { exact: true }).fill('Mock support test');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('Your message has been sent.', { exact: false }).waitFor();
    await page.unroute('https://formspree.io/f/xgaawjzg');
    await page.route('https://formspree.io/f/xgaawjzg', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.getByLabel('Your name').fill('Test');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Message', { exact: true }).fill('Mock failure');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByRole('alert').getByText('Unable to send your message.', { exact: false }).waitFor();
  });
  await t.test('configured Google button exchanges a signed token for a session', async () => {
    const audience = 'browser-school-test.apps.googleusercontent.com';
    const googleEmail = `google-${email}`;
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const certificateMock = mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({
      certs: { 'browser-test': publicKey.export({ type: 'spki', format: 'pem' }) }, format: 'PEM',
    }));
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'browser-test' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: audience,
      sub: `browser-google-${email}`, email: googleEmail, email_verified: true,
      name: 'Google Browser Student', iat: now - 10, exp: now + 3600 })).toString('base64url');
    const data = `${header}.${payload}`;
    const credential = `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
    process.env.GOOGLE_CLIENT_ID = audience;
    try {
      await vite.close();
      vite = await createViteServer({
        configFile: false, root: process.cwd(), plugins: [react()],
        define: { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(audience) },
        server: { host: '127.0.0.1', port: 5174, strictPort: true,
          proxy: { '/api': { target: `http://127.0.0.1:${api.address().port}` } } }, logLevel: 'error',
      });
      await vite.listen();
      await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({
        status: 200, contentType: 'application/javascript', body: `
          window.google = { accounts: { id: {
            initialize(options) { window.testGoogleOptions = options; },
            renderButton(element) {
              const button = document.createElement('button');
              button.textContent = 'Continue with Google';
              button.onclick = () => window.testGoogleOptions.callback({ credential: ${JSON.stringify(credential)} });
              element.replaceChildren(button);
            },
            cancel() {}, disableAutoSelect() {}, prompt() {}
          } } };
        `,
      }));
      await page.goto(base);
      const google = page.getByRole('button', { name: 'Continue with Google', exact: true });
      await google.waitFor();
      assert.equal(await page.evaluate(() => window.testGoogleOptions.client_id), audience);
      assert.equal(await page.locator('.google-login-wrapper').evaluate(el => getComputedStyle(el).opacity), '1');
      assert.equal((await waitResponse('google-login', () => google.click())).status(), 200);
      await page.waitForURL(`${base}/dashboard`);
      await page.locator('.sh-app').waitFor();
      assert.equal((await page.request.get(`${base}/api/session`).then(r => r.json())).user.email, googleEmail);
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      await page.waitForURL(`${base}/`);
    } finally {
      certificateMock.mock.restore();
      delete process.env.GOOGLE_CLIENT_ID;
      await query('DELETE FROM users WHERE email = $1', [googleEmail]);
    }
  });
  await t.test('recovery without a token offers a new link instead of a broken form', async () => {
    await page.goto(`${base}/reset-password`);
    await page.getByRole('heading', { name: 'Let’s try a fresh link' }).waitFor();
    assert.equal(await page.locator('form').count(), 0);
    await page.getByRole('link', { name: 'Request a new reset link' }).click();
    await page.waitForURL(`${base}/forgot-password`);
    await page.getByRole('button', { name: 'Send reset link' }).waitFor();
  });
  await t.test('mobile login renders without horizontal overflow or runtime errors', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/signup', '/forgot-password', '/reset-password']) {
        await page.goto(`${base}${path}`);
        await page.locator('.auth-card h1').waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${path} should fit at ${width}px`);
      }
    }
    assert.equal(dialogs.length, 0, 'Authentication should use inline feedback rather than browser alerts');
    assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));
  });
  await t.test('all public account and support screens are accessible in both themes on desktop and mobile', async () => {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => localStorage.setItem('theme', value), theme);
      for (const width of [390, 1440]) {
        await page.setViewportSize({width, height:900});
        for (const path of ['/', '/signup', '/forgot-password', '/reset-password', '/support']) {
          await page.goto(`${base}${path}`);
          await page.locator('.auth-card h1').waitFor();
          await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
          const violations = await page.evaluate(async () => (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
          assert.deepEqual(violations, [], `${theme} ${width}px ${path}`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme} ${width}px ${path}`);
        }
      }
    }
  });
});
