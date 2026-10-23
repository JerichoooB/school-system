import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";
import handler from "../server/handler.js";
import { getPool, query } from "../server/db.js";

// Explicitly isolated database: never run destructive fixtures on an application database.
const url = process.env.TEST_DATABASE_URL;
const enabled = url && new URL(url).pathname.endsWith("_test");
let server, base;
const emails = [];
const originalFetch = globalThis.fetch;
const oldEnv = { ...process.env };
const digest = (value) => createHash("sha256").update(value).digest("hex");
before(async () => {
  if (!enabled) return;
  process.env.DATABASE_URL = url;
  process.env.APP_URL = "http://localhost:5173";
  process.env.MAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "test-only";
  process.env.MAIL_FROM = "School Hub <test@example.test>";
  for (const migration of (
    await readdir(new URL("../db/migrations/", import.meta.url))
  ).sort())
    await query(
      await readFile(
        new URL(`../db/migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );
  await query("TRUNCATE sessions, auth_limits, users RESTART IDENTITY CASCADE");
  globalThis.fetch = async (input, options) => {
    if (input === "https://api.resend.com/emails") {
      emails.push(JSON.parse(options.body));
      return new Response('{"id":"mock-delivery"}', { status: 200 });
    }
    return originalFetch(input, options);
  };
  server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  globalThis.fetch = originalFetch;
  if (server) await new Promise((resolve) => server.close(resolve));
  if (enabled) await getPool().end();
  for (const key of [
    "DATABASE_URL",
    "APP_URL",
    "RESEND_API_KEY",
    "MAIL_FROM",
    "MAIL_PROVIDER",
  ]) {
    if (oldEnv[key] === undefined) delete process.env[key];
    else process.env[key] = oldEnv[key];
  }
});
async function request(action, body, cookie, origin) {
  const response = await fetch(`${base}/api/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

test(
  "PostgreSQL authentication lifecycle, session revocation, and request protection",
  {
    skip:
      !enabled &&
      "Set TEST_DATABASE_URL to an isolated database ending in _test",
  },
  async () => {
    const email = "student@example.test";
    const password = "Correct horse battery!";
    assert.equal((await request("session")).status, 401);
    assert.equal(
      (
        await request(
          "login",
          { email, password },
          null,
          "https://attacker.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("register", { name: "Alex", email, password })).status,
      200,
    );
    const firstCode = emails.at(-1).text.match(/\b\d{6}\b/)[0];
    await query(
      "UPDATE users SET verification_expires = now() - interval '1 minute' WHERE email=$1",
      [email],
    );
    assert.equal(
      (await request("verify-email", { email, code: firstCode })).status,
      400,
    );
    assert.equal((await request("resend-verification", { email })).status, 200);
    const code = emails.at(-1).text.match(/\b\d{6}\b/)[0];
    const stored = (await query("SELECT * FROM users WHERE email=$1", [email]))
      .rows[0];
    assert.notEqual(stored.password, password);
    assert.notEqual(stored.verification_code_hash, code);
    assert.equal((await request("login", { email, password })).status, 403);
    assert.equal(
      (await request("verify-email", { email, code: "000000" })).status,
      400,
    );
    assert.equal(
      (await request("verify-email", { email, code })).body.success,
      true,
    );
    assert.equal((await request("verify-email", { email, code })).status, 400);
    assert.equal(
      (await request("login", { email, password: "Wrong password!" })).status,
      401,
    );
    const signedIn = await request("login", { email, password });
    assert.equal(signedIn.status, 200);
    assert.ok(signedIn.cookie.startsWith("school_session="));
    assert.equal(signedIn.body.user.password, undefined);
    assert.equal(
      (await request("session", undefined, signedIn.cookie)).body.user.email,
      email,
    );
    assert.equal(
      (await request("forgot-password", { email })).body.success,
      true,
    );
    const token = emails.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
    assert.equal(
      (
        await query("SELECT reset_token_hash FROM users WHERE email=$1", [
          email,
        ])
      ).rows[0].reset_token_hash,
      digest(token),
    );
    const resetPassword = "Changed password 123!";
    assert.equal(
      (await request("reset-password", { token, password: resetPassword }))
        .status,
      200,
    );
    assert.equal(
      (await request("reset-password", { token, password: resetPassword }))
        .status,
      400,
    );
    assert.equal(
      (await request("session", undefined, signedIn.cookie)).status,
      401,
    );
    assert.equal((await request("login", { email, password })).status, 401);
    const newLogin = await request("login", { email, password: resetPassword });
    assert.equal(newLogin.status, 200);
    assert.equal((await request("logout", {}, newLogin.cookie)).status, 200);
    assert.equal(
      (await request("session", undefined, newLogin.cookie)).status,
      401,
    );
    const unknown = await request("forgot-password", {
      email: "unknown@example.test",
    });
    assert.equal(
      unknown.body.message,
      "If an account exists, a password reset email will be sent.",
    );
    assert.equal(
      (await request("register", { name: "Other", email, password })).status,
      409,
    );
    assert.equal((await request("unknown", {})).status, 404);
    assert.equal((await request("login")).status, 405);
  },
);

test(
  "email failure does not leave a newly registered account behind; rate limits persist in PostgreSQL",
  { skip: !enabled },
  async () => {
    const email = "delivery-failure@example.test";
    globalThis.fetch = (input, options) =>
      input === "https://api.resend.com/emails"
        ? Promise.resolve(new Response("{}", { status: 503 }))
        : originalFetch(input, options);
    const result = await request("register", {
      name: "Test",
      email,
      password: "Valid password 123",
    });
    assert.equal(result.status, 502);
    assert.equal(
      (await query("SELECT id FROM users WHERE email=$1", [email])).rowCount,
      0,
    );
    delete process.env.RESEND_API_KEY;
    assert.equal(
      (
        await request("register", {
          name: "Test",
          email,
          password: "Valid password 123",
        })
      ).status,
      503,
    );
    process.env.RESEND_API_KEY = "test-only";
    for (let i = 0; i < 8; i++)
      await request("login", {
        email: "limits@example.test",
        password: "Valid password 123",
      });
    assert.equal(
      (
        await request("login", {
          email: "limits@example.test",
          password: "Valid password 123",
        })
      ).status,
      429,
    );
  },
);

test(
  "Google ID tokens are cryptographically verified and safely create or reuse accounts",
  { skip: !enabled },
  async (t) => {
    const originalClient = process.env.GOOGLE_CLIENT_ID;
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const audience = "test-school-hub.apps.googleusercontent.com";
    const certMock = mock.method(
      OAuth2Client.prototype,
      "getFederatedSignonCertsAsync",
      async () => ({
        certs: {
          "test-key": publicKey.export({ type: "spki", format: "pem" }),
        },
        format: "PEM",
      }),
    );
    function token(overrides = {}, signingKey = privateKey) {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(
        JSON.stringify({ alg: "RS256", kid: "test-key" }),
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          iss: "https://accounts.google.com",
          aud: audience,
          sub: "google-subject-123",
          email: "google-student@example.test",
          email_verified: true,
          name: "Google Student",
          iat: now - 10,
          exp: now + 3600,
          ...overrides,
        }),
      ).toString("base64url");
      const data = `${header}.${payload}`;
      return `${data}.${sign("RSA-SHA256", Buffer.from(data), signingKey).toString("base64url")}`;
    }
    try {
      delete process.env.GOOGLE_CLIENT_ID;
      await t.test("missing configuration fails explicitly", async () => {
        assert.equal(
          (await request("google-login", { credential: token() })).status,
          503,
        );
      });
      process.env.GOOGLE_CLIENT_ID = audience;
      await t.test(
        "wrong audience, issuer, expiry, signature and unverified email are rejected",
        async () => {
          for (const claims of [
            { aud: "another-client" },
            { iss: "https://attacker.example" },
            {
              iat: Math.floor(Date.now() / 1000) - 7200,
              exp: Math.floor(Date.now() / 1000) - 3600,
            },
            { email_verified: false },
          ]) {
            assert.equal(
              (await request("google-login", { credential: token(claims) }))
                .status,
              401,
            );
          }
          const alternateKey = generateKeyPairSync("rsa", {
            modulusLength: 2048,
          }).privateKey;
          assert.equal(
            (
              await request("google-login", {
                credential: token({}, alternateKey),
              })
            ).status,
            401,
          );
          assert.equal(
            (await request("google-login", { credential: "not-a-jwt" })).status,
            401,
          );
        },
      );
      let first;
      await t.test(
        "valid signed ID token creates a Google account and server session",
        async () => {
          first = await request("google-login", { credential: token() });
          assert.equal(first.status, 200);
          assert.equal(first.body.user.auth_provider, "google");
          assert.equal(first.body.user.email_verified, 1);
          assert.equal(
            (await request("session", undefined, first.cookie)).body.user.email,
            "google-student@example.test",
          );
        },
      );
      await t.test(
        "repeat sign-in reuses the account and supports logout",
        async () => {
          const again = await request("google-login", { credential: token() });
          assert.equal(again.status, 200);
          assert.equal(again.body.user.id, first.body.user.id);
          assert.equal(
            (
              await query(
                "SELECT id FROM users WHERE email='google-student@example.test'",
              )
            ).rowCount,
            1,
          );
          assert.equal((await request("logout", {}, again.cookie)).status, 200);
          assert.equal(
            (await request("session", undefined, again.cookie)).status,
            401,
          );
        },
      );
      await t.test(
        "local account and mismatched Google subject cannot be taken over",
        async () => {
          assert.equal(
            (
              await request("google-login", {
                credential: token({ email: "student@example.test" }),
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await request("google-login", {
                credential: token({ sub: "different-google-subject" }),
              })
            ).status,
            409,
          );
        },
      );
      await t.test(
        "verified local account can explicitly link a matching Google identity",
        async () => {
          const session = await request("login", {
            email: "student@example.test",
            password: "Changed password 123!",
          });
          assert.equal(session.status, 200);
          assert.equal(
            (
              await request(
                "link-google",
                {
                  credential: token({
                    email: "other@example.test",
                    sub: "linked-subject",
                  }),
                },
                session.cookie,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await request(
                "link-google",
                {
                  credential: token({
                    email: "student@example.test",
                    sub: "linked-subject",
                  }),
                },
                session.cookie,
              )
            ).status,
            200,
          );
          const google = await request("google-login", {
            credential: token({
              email: "student@example.test",
              sub: "linked-subject",
            }),
          });
          assert.equal(google.status, 200);
          assert.equal(google.body.user.id, session.body.user.id);
          assert.equal(
            (
              await request("login", {
                email: "student@example.test",
                password: "Changed password 123!",
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await request("google-login", {
                credential: token({
                  email: "student@example.test",
                  sub: "wrong-linked-subject",
                }),
              })
            ).status,
            409,
          );
        },
      );
    } finally {
      certMock.mock.restore();
      if (originalClient === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = originalClient;
    }
  },
);

test(
  "deployment request formats, malformed payloads, expired reset tokens and secure cookies",
  { skip: !enabled },
  async () => {
    const invalid = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid",
    });
    assert.equal(invalid.status, 400);
    const oversized = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(17000) }),
    });
    assert.equal(oversized.status, 413);
    const encoded = await fetch(`${base}/api/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=no-such-account%40example.test",
    });
    assert.equal(encoded.status, 200);
    assert.equal((await encoded.json()).success, true);
    const expiredToken = "e".repeat(64);
    await query(
      "UPDATE users SET reset_token_hash=$1, reset_expires=now()-interval '1 hour' WHERE email='student@example.test'",
      [digest(expiredToken)],
    );
    assert.equal(
      (
        await request("reset-password", {
          token: expiredToken,
          password: "Another valid password!",
        })
      ).status,
      400,
    );
    const oldNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const response = await fetch(`${base}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "student@example.test",
          password: "Changed password 123!",
        }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie");
      assert.match(cookie, /; Secure/);
      assert.match(cookie, /; HttpOnly/);
      assert.match(cookie, /; SameSite=Lax/);
    } finally {
      if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldNodeEnv;
    }
  },
);

test(
  "Gmail provider completes signup verification and password recovery through the API",
  { skip: !enabled },
  async () => {
    const keys = ["MAIL_PROVIDER", "GMAIL_USER", "GMAIL_APP_PASSWORD"];
    const previous = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    process.env.MAIL_PROVIDER = "gmail";
    process.env.GMAIL_USER = "sender@example.test";
    process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
    const delivered = [];
    let failDelivery = false;
    const smtpMock = mock.method(nodemailer, "createTransport", () => ({
      async sendMail(message) {
        if (failDelivery) throw new Error("SMTP rejected test delivery");
        delivered.push(message);
        return { accepted: [message.to] };
      },
    }));
    try {
      const email = "gmail-flow@example.test";
      const password = "Gmail flow password 123!";
      assert.equal(
        (await request("register", { name: "Gmail Flow", email, password }))
          .status,
        200,
      );
      assert.equal(delivered.at(-1).from.address, "sender@example.test");
      assert.equal(delivered.at(-1).to, email);
      const code = delivered.at(-1).text.match(/\b\d{6}\b/)[0];
      assert.equal(
        (await request("verify-email", { email, code })).status,
        200,
      );
      const login = await request("login", { email, password });
      assert.equal(login.status, 200);
      assert.equal((await request("forgot-password", { email })).status, 200);
      const token = delivered.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
      const changed = "Changed Gmail password 456!";
      assert.equal(
        (await request("reset-password", { token, password: changed })).status,
        200,
      );
      assert.equal(
        (await request("session", undefined, login.cookie)).status,
        401,
      );
      assert.equal(
        (await request("login", { email, password: changed })).status,
        200,
      );
      failDelivery = true;
      const failed = await request("register", {
        name: "Failure",
        email: "gmail-failure@example.test",
        password,
      });
      assert.equal(failed.status, 502);
      assert.equal(
        (
          await query(
            "SELECT id FROM users WHERE email='gmail-failure@example.test'",
          )
        ).rowCount,
        0,
      );
    } finally {
      smtpMock.mock.restore();
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  },
);
