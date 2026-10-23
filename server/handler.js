import { createHash, randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { schoolHandler } from "./school.js";
import { fileHandler } from "./files.js";
import { jobsHandler } from "./jobs.js";
import { OAuth2Client } from "google-auth-library";
import { query, getPool } from "./db.js";
import { requireMailConfig, sendAccountEmail } from "./mail.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const publicUser = ({
  id,
  name,
  email,
  auth_provider,
  email_verified,
  role = "student",
  status = "active",
}) => ({ id, name, email, auth_provider, email_verified, role, status });
const emailOf = (body) =>
  String(body.email || "")
    .trim()
    .toLowerCase();
const validEmail = (email) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const fail = (status, message) => Object.assign(new Error(message), { status });
const validPassword = (password) =>
  typeof password === "string" &&
  password.length >= 8 &&
  Buffer.byteLength(password) <= 72;
const sessionToken = (req) =>
  /(?:^|;\s*)school_session=([a-f0-9]{64})(?:;|$)/.exec(
    req.headers.cookie || "",
  )?.[1];

function originFor() {
  if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL)
    throw fail(503, "APP_URL is not configured.");
  return "http://localhost:5173";
}
function cookie(value, maxAge) {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL ||
    process.env.APP_URL?.startsWith("https:");
  return `school_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
async function createSession(req, res, user) {
  if (user.status === "inactive") throw fail(403, "This account is inactive.");
  const token = randomBytes(32).toString("hex");
  const old = sessionToken(req);
  if (old)
    await query("DELETE FROM sessions WHERE token_hash = $1", [hash(old)]);
  await query(
    "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')",
    [hash(token), user.id],
  );
  res.setHeader("Set-Cookie", cookie(token, 604800));
  return { success: true, user: publicUser(user) };
}
async function limit(key, maximum) {
  const { rows } = await query(
    `INSERT INTO auth_limits(key, count, expires_at) VALUES ($1, 1, now() + interval '15 minutes')
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN auth_limits.expires_at < now() THEN 1 ELSE auth_limits.count + 1 END,
    expires_at = CASE WHEN auth_limits.expires_at < now() THEN now() + interval '15 minutes' ELSE auth_limits.expires_at END RETURNING count`,
    [hash(key)],
  );
  if (rows[0].count > maximum)
    throw fail(429, "Too many attempts. Please try again in 15 minutes.");
}
async function readBody(req, maximum = 16384) {
  if (req.body !== undefined) {
    if (typeof req.body === "string")
      return parseBody(req.body, req.headers["content-type"], maximum);
    if (Buffer.byteLength(JSON.stringify(req.body)) > maximum)
      throw fail(413, "Request is too large.");
    return req.body || {};
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maximum)
      throw fail(413, "Request is too large.");
  }
  return parseBody(raw, req.headers["content-type"], maximum);
}
function parseBody(raw, type = "", maximum = 16384) {
  if (Buffer.byteLength(raw) > maximum)
    throw fail(413, "Request is too large.");
  if (type.includes("application/x-www-form-urlencoded"))
    return Object.fromEntries(new URLSearchParams(raw));
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw fail(400, "Invalid JSON.");
  }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  try {
    const action = new URL(req.url, "http://localhost").pathname
      .split("/")
      .filter(Boolean)
      .at(-1);
    if (req.headers.origin && req.headers.origin !== originFor())
      throw fail(403, "Origin is not allowed.");
    if (action === "health") {
      if (req.method !== "GET") throw fail(405, "Method not allowed.");
      try {
        await query("SELECT 1");
        return res.end(
          JSON.stringify({ success: true, database: "available" }),
        );
      } catch {
        throw fail(503, "Database is unavailable.");
      }
    }
    if (action === "jobs") return await jobsHandler(req, res);
    if (action === "file") return await fileHandler(req, res);
    if (action === "school") return await schoolHandler(req, res, readBody);
    const expectedMethod = action === "session" ? "GET" : "POST";
    if (req.method !== expectedMethod) {
      res.setHeader("Allow", expectedMethod);
      throw fail(405, "Method not allowed.");
    }
    if (req.headers.origin && req.headers.origin !== originFor())
      throw fail(403, "Origin is not allowed.");
    if (action === "session") {
      const token = sessionToken(req);
      if (!token) throw fail(401, "Please sign in.");
      const { rows } = await query(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()",
        [hash(token)],
      );
      if (!rows[0]) throw fail(401, "Please sign in.");
      if (rows[0].status === "inactive")
        throw fail(403, "This account is inactive.");
      return res.end(
        JSON.stringify({ success: true, user: publicUser(rows[0]) }),
      );
    }
    if (action === "logout") {
      const token = sessionToken(req);
      if (token)
        await query("DELETE FROM sessions WHERE token_hash = $1", [
          hash(token),
        ]);
      res.setHeader("Set-Cookie", cookie("", 0));
      return res.end(JSON.stringify({ success: true }));
    }
    if (
      ![
        "login",
        "register",
        "verify-email",
        "forgot-password",
        "reset-password",
        "google-login",
        "link-google",
        "resend-verification",
      ].includes(action)
    )
      throw fail(404, "Endpoint not found.");
    const body = await readBody(req);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw fail(400, "Invalid request.");
    // Vercel's trusted client IP header cannot be supplied by external callers.
    const ip = process.env.VERCEL
      ? req.headers["x-vercel-forwarded-for"] || "unknown"
      : req.socket?.remoteAddress || "local";
    await limit(`ip:${ip}:${action}`, 40);
    const email = emailOf(body);
    let result;
    if (
      [
        "login",
        "register",
        "verify-email",
        "forgot-password",
        "resend-verification",
      ].includes(action)
    ) {
      if (!validEmail(email)) throw fail(400, "A valid email is required.");
      await limit(
        `email:${email}:${action}`,
        action === "verify-email" ? 10 : 8,
      );
    }
    if (action === "resend-verification") {
      requireMailConfig();
      await limit(`resend:${email}`, 3);
      const code = String(randomInt(100000, 1000000));
      const { rows } = await query(
        `UPDATE users SET verification_code_hash = $1,
        verification_expires = now() + interval '10 minutes', verification_attempts = 0
        WHERE email = $2 AND email_verified = 0 AND auth_provider = 'local' RETURNING id`,
        [hash(code), email],
      );
      if (rows[0])
        await sendAccountEmail(
          email,
          "Verify your School Hub account",
          `Your verification code is ${code}. It expires in 10 minutes.`,
        );
      result = {
        success: true,
        message: "If verification is needed, a new code will be sent.",
      };
    } else if (action === "register") {
      const name = String(body.name || "").trim();
      if (!name || name.length > 120 || !validPassword(body.password))
        throw fail(400, "Enter a name and a password of 8–72 bytes.");
      requireMailConfig();
      const code = String(randomInt(100000, 1000000));
      const password = await bcrypt.hash(body.password, 12);
      const { rows } = await query(
        `INSERT INTO users(name,email,password,verification_code_hash,verification_expires)
        VALUES ($1,$2,$3,$4,now() + interval '10 minutes')
        ON CONFLICT (email) DO NOTHING RETURNING id`,
        [name, email, password, hash(code)],
      );
      if (!rows[0])
        throw fail(
          409,
          "An account already exists. Sign in or use password recovery.",
        );
      try {
        await sendAccountEmail(
          email,
          "Verify your School Hub account",
          `Your verification code is ${code}. It expires in 10 minutes.`,
        );
      } catch (error) {
        await query("DELETE FROM users WHERE id = $1 AND email_verified = 0", [
          rows[0].id,
        ]);
        throw error;
      }
      result = {
        success: true,
        message: "Verification code sent to your email.",
      };
    } else if (action === "verify-email") {
      if (!/^\d{6}$/.test(String(body.code || "")))
        throw fail(400, "Enter the six-digit code.");
      // Count guesses in PostgreSQL so limits apply across serverless instances.
      const { rows } = await query(
        `UPDATE users SET verification_attempts = verification_attempts + 1
        WHERE email = $1 AND email_verified = 0 AND verification_attempts < 10 RETURNING *`,
        [email],
      );
      const user = rows[0];
      if (
        !user ||
        !user.verification_expires ||
        new Date(user.verification_expires) <= new Date() ||
        user.verification_code_hash !== hash(String(body.code))
      )
        throw fail(400, "Invalid or expired verification code.");
      const verified = await query(
        `UPDATE users SET email_verified = 1, verification_code_hash = NULL, verification_expires = NULL
        WHERE id = $1 AND email_verified = 0 AND verification_code_hash = $2 AND verification_expires > now() RETURNING id`,
        [user.id, hash(String(body.code))],
      );
      if (!verified.rows[0])
        throw fail(400, "Invalid or expired verification code.");
      result = {
        success: true,
        message: "Email verified. You can now sign in.",
      };
    } else if (action === "login") {
      if (!validPassword(body.password))
        throw fail(401, "Invalid email or password.");
      const { rows } = await query("SELECT * FROM users WHERE email = $1", [
        email,
      ]);
      const user = rows[0];
      // A fixed bcrypt hash prevents an inexpensive missing-user timing path.
      const stored =
        user?.password?.replace(/^\$2y\$/, "$2b$") ||
        "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
      const matches = await bcrypt.compare(body.password, stored);
      if (!user || user.auth_provider !== "local" || !matches)
        throw fail(401, "Invalid email or password.");
      if (!user.email_verified)
        throw fail(403, "Please verify your email before signing in.");
      result = await createSession(req, res, user);
    } else if (action === "forgot-password") {
      requireMailConfig();
      const { rows } = await query(
        "SELECT * FROM users WHERE email = $1 AND auth_provider = 'local'",
        [email],
      );
      if (rows[0]) {
        const token = randomBytes(32).toString("hex");
        await query(
          "UPDATE users SET reset_token_hash = $1, reset_expires = now() + interval '1 hour' WHERE id = $2",
          [hash(token), rows[0].id],
        );
        const link = `${originFor()}/reset-password?token=${token}`;
        await sendAccountEmail(
          email,
          "Reset your School Hub password",
          `Reset your password: ${link}\nThis link expires in one hour. Ignore this message if you did not request it.`,
        );
      }
      result = {
        success: true,
        message: "If an account exists, a password reset email will be sent.",
      };
    } else if (action === "reset-password") {
      if (
        !validPassword(body.password) ||
        !/^[a-f0-9]{64}$/.test(String(body.token || ""))
      )
        throw fail(
          400,
          "A valid token and password of 8–72 bytes are required.",
        );
      const password = await bcrypt.hash(body.password, 12);
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `UPDATE users SET password = $1, reset_token_hash = NULL, reset_expires = NULL
          WHERE reset_token_hash = $2 AND reset_expires > now() RETURNING id`,
          [password, hash(body.token)],
        );
        if (!rows[0]) throw fail(400, "Invalid or expired reset token.");
        await client.query("DELETE FROM sessions WHERE user_id = $1", [
          rows[0].id,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      res.setHeader("Set-Cookie", cookie("", 0));
      result = { success: true, message: "Password reset. Please sign in." };
    } else if (action === "google-login" || action === "link-google") {
      if (!process.env.GOOGLE_CLIENT_ID)
        throw fail(503, "Google sign-in is not configured.");
      if (typeof body.credential !== "string" || body.credential.length > 10000)
        throw fail(400, "Google credential is required.");
      let payload;
      try {
        const ticket = await new OAuth2Client(
          process.env.GOOGLE_CLIENT_ID,
        ).verifyIdToken({
          idToken: body.credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch {
        throw fail(401, "Invalid Google credential.");
      }
      if (
        !payload?.email_verified ||
        !payload.sub ||
        !validEmail(payload.email || "")
      )
        throw fail(401, "A verified Google email is required.");
      if (action === "link-google") {
        const token = sessionToken(req);
        const current = (
          await query(
            "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
            [hash(token || "")],
          )
        ).rows[0];
        if (!current || current.status !== "active")
          throw fail(401, "Please sign in.");
        if (
          current.email !== payload.email.toLowerCase() ||
          !current.email_verified
        )
          throw fail(
            400,
            "Link the verified Google account with the same email address.",
          );
        try {
          await query("UPDATE users SET google_id=$2 WHERE id=$1", [
            current.id,
            payload.sub,
          ]);
        } catch (error) {
          if (error.code === "23505")
            throw fail(409, "This Google account is already linked.");
          throw error;
        }
        return res.end(
          JSON.stringify({ success: true, message: "Google account linked." }),
        );
      }
      const { rows } = await query(
        `INSERT INTO users(name,email,auth_provider,google_id,email_verified) VALUES ($1,$2,'google',$3,1)
        ON CONFLICT (email) DO UPDATE SET name = CASE WHEN users.auth_provider='google' THEN EXCLUDED.name ELSE users.name END WHERE users.google_id = EXCLUDED.google_id RETURNING *`,
        [
          String(payload.name || payload.email).slice(0, 120),
          payload.email.toLowerCase(),
          payload.sub,
        ],
      );
      if (!rows[0])
        throw fail(
          409,
          "This email already has a local account. Sign in with your password.",
        );
      result = await createSession(req, res, rows[0]);
    }
    res.end(JSON.stringify(result));
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = error.status || 500;
    res.statusCode = status;
    if (status === 500)
      console.error("API request failed", { code: error.code || "INTERNAL" });
    res.end(
      JSON.stringify({
        success: false,
        message:
          status === 500
            ? "The service is temporarily unavailable."
            : error.message,
      }),
    );
  }
}
