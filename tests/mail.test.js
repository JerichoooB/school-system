import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { requireMailConfig, sendAccountEmail } from '../server/mail.js';

const keys = ['MAIL_PROVIDER', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'RESEND_API_KEY', 'MAIL_FROM'];
function withEnv(values, run) {
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
  }
  return Promise.resolve().then(run).finally(() => {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
  });
}
const gmail = { MAIL_PROVIDER: 'gmail', GMAIL_USER: 'schoolhub@example.test', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' };

test('Gmail configuration requires a sender and a 16-character App password without a custom domain', async () => {
  await withEnv(gmail, () => {
    const config = requireMailConfig();
    assert.equal(config.provider, 'gmail');
    assert.equal(config.pass, 'abcdefghijklmnop');
  });
  for (const values of [
    { MAIL_PROVIDER: 'gmail' },
    { ...gmail, GMAIL_APP_PASSWORD: '' },
    { ...gmail, GMAIL_APP_PASSWORD: 'short' },
    { ...gmail, GMAIL_USER: 'not-an-email' },
    { ...gmail, MAIL_PROVIDER: 'unknown' },
  ]) {
    await withEnv(values, () => assert.throws(requireMailConfig, error => error.status === 503));
  }
});

test('Gmail sends verification/reset text from the authenticated address over verified TLS', async () => {
  await withEnv(gmail, async () => {
    const realCreateTransport = nodemailer.createTransport.bind(nodemailer);
    const messages = [];
    const transportMock = mock.method(nodemailer, 'createTransport', options => {
      assert.equal(options.host, 'smtp.gmail.com');
      assert.equal(options.port, 465);
      assert.equal(options.secure, true);
      assert.equal(options.tls.rejectUnauthorized, true);
      assert.equal(options.auth.user, gmail.GMAIL_USER);
      assert.equal(options.auth.pass, 'abcdefghijklmnop');
      // Use Nodemailer's real message composition; replace only the external delivery transport.
      const transport = realCreateTransport({ jsonTransport: true });
      return { async sendMail(message) {
        const result = await transport.sendMail(message);
        messages.push(JSON.parse(result.message));
        return result;
      } };
    });
    try {
      await sendAccountEmail('student@example.test', 'Verify your School Hub account', 'Your code is 123456.');
      await sendAccountEmail('student@example.test', 'Reset your School Hub password', 'https://schoolhub-ri.vercel.app/reset-password?token=test-only');
      assert.equal(messages.length, 2);
      assert.equal(messages[0].from.address, gmail.GMAIL_USER);
      assert.equal(messages[0].to[0].address, 'student@example.test');
      assert.match(messages[0].text, /123456/);
      assert.match(messages[1].text, /schoolhub-ri\.vercel\.app\/reset-password/);
      assert.ok(!JSON.stringify(messages).includes('abcdefghijklmnop'));
    } finally { transportMock.mock.restore(); }
  });
});

test('Gmail delivery failures return a safe error without leaking SMTP credentials', async () => {
  await withEnv(gmail, async () => {
    const transportMock = mock.method(nodemailer, 'createTransport', () => ({
      async sendMail() { throw new Error('AUTH failed: abcdefghijklmnop'); },
    }));
    try {
      await assert.rejects(sendAccountEmail('student@example.test', 'Verify', '123456'), error => {
        assert.equal(error.status, 502);
        assert.ok(!error.message.includes('abcdefghijklmnop'));
        return true;
      });
    } finally { transportMock.mock.restore(); }
  });
});
