import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { query, getPool } from "../server/db.js";
// This check creates and removes only its unique temporary account and one private file.
const base = new URL(
  process.env.SMOKE_BASE_URL || "https://schoolhub-ri.vercel.app",
).origin;
if (!base.startsWith("https://") && !base.startsWith("http://localhost:"))
  throw new Error("Use HTTPS for a remote smoke check.");
const email = `deployment-${randomBytes(12).toString("hex")}@example.invalid`,
  password = randomBytes(24).toString("base64url") + "!a";
let userId, cookie, fileId;
async function request(
  path,
  { method = "GET", body, authenticated = true } = {},
) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(authenticated && cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  return response;
}
try {
  const health = await request("health", { authenticated: false });
  assert.equal(health.status, 200, "Deployed API health check failed.");
  assert.equal((await health.json()).database, "available");
  console.log("PASS deployed API connects to PostgreSQL");
  userId = (
    await query(
      "INSERT INTO users(name,email,password,email_verified) VALUES($1,$2,$3,1) RETURNING id",
      ["Deployment check", email, await bcrypt.hash(password, 12)],
    )
  ).rows[0].id;
  await query(
    "INSERT INTO profiles(user_id,notify_assignments,notify_announcements,notify_grades) VALUES($1,false,false,false)",
    [userId],
  );
  const login = await request("login", {
    method: "POST",
    body: { email, password },
    authenticated: false,
  });
  assert.equal(login.status, 200, "Temporary account login failed.");
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  cookie = setCookie.split(";")[0];
  const session = await request("session");
  assert.equal((await session.json()).user.id, userId);
  console.log("PASS HTTPS login and server session");
  const school = await request("school");
  assert.equal(school.status, 200);
  const records = await school.json();
  assert.equal(records.user.role, "student");
  assert.equal(records.people.length, 0);
  assert.equal(records.audit_logs, undefined);
  console.log("PASS deployed role-scoped school API");
  await query("UPDATE users SET role='admin' WHERE id=$1", [userId]);
  try {
    const readiness = await request("school");
    const state = await readiness.json();
    assert.equal(state.services.database, true);
    assert.equal(
      state.services.emailConfigured,
      true,
      "Account email configuration is missing.",
    );
    assert.equal(
      state.services.cronConfigured,
      true,
      "CRON_SECRET is missing on the deployed function.",
    );
    console.log(
      "PASS deployed email and cron configuration presence (not an inbox-delivery test)",
    );
  } finally {
    await query("UPDATE users SET role='student' WHERE id=$1", [userId]);
  }
  const content = "School Hub private deployment check";
  const upload = await request("file", {
    method: "POST",
    body: {
      purpose: "document",
      name: "deployment-check.txt",
      content_type: "text/plain",
      base64: Buffer.from(content).toString("base64"),
    },
  });
  const uploadResult = await upload.json();
  assert.equal(
    upload.status,
    200,
    uploadResult.message || "Private Blob upload failed.",
  );
  fileId = uploadResult.file.id;
  const file = await request(`file?id=${fileId}`);
  assert.equal(file.status, 200);
  assert.equal(await file.text(), content);
  const anonymous = await request(`file?id=${fileId}`, {
    authenticated: false,
  });
  assert.equal(anonymous.status, 401);
  console.log(
    "PASS live private Vercel Blob upload, download and anonymous denial",
  );
  assert.equal(
    (await request(`file?id=${fileId}`, { method: "DELETE" })).status,
    200,
  );
  fileId = null;
  const jobs = await request("jobs", { authenticated: false });
  assert.equal(jobs.status, 401);
  console.log("PASS scheduled-job endpoint rejects unauthorized requests");
  if (process.env.SMOKE_BROWSER === "1") {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      executablePath: process.env.BROWSER_EXECUTABLE || undefined,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage();
      const [name, value] = cookie.split("=");
      await page.context().addCookies([
        {
          name,
          value,
          url: base,
          httpOnly: true,
          secure: base.startsWith("https://"),
          sameSite: "Lax",
        },
      ]);
      for (const path of [
        "dashboard",
        "profile",
        "courses",
        "schedule",
        "grades",
        "attendance",
        "assignments",
        "announcements",
        "exams",
        "settings",
        "help",
      ]) {
        await page.goto(`${base}/${path}`);
        await page.locator(".sh-main h1").waitFor();
      }
      console.log("PASS deployed browser navigation across 11 student screens");
    } finally {
      await browser.close();
    }
  }
  assert.equal((await request("logout", { method: "POST" })).status, 200);
  assert.equal((await request("session")).status, 401);
  cookie = null;
  console.log("PASS logout revokes the production test session");
} catch (error) {
  console.error("Deployment check failed:", error.message);
  process.exitCode = 1;
} finally {
  if (fileId && cookie) {
    try {
      const response = await request(`file?id=${fileId}`, { method: "DELETE" });
      if (response.ok) fileId = null;
    } catch {
      /* Keep metadata if remote cleanup failed; never orphan an uploaded file. */
    }
  }
  if (userId) {
    if (fileId) {
      await query("UPDATE users SET status='inactive' WHERE id=$1", [userId]);
      console.error("Temporary file cleanup needs administrator attention.");
      process.exitCode = 1;
    } else {
      await query("DELETE FROM users WHERE id=$1 AND email=$2", [
        userId,
        email,
      ]);
      console.log("Temporary deployment-check account removed.");
    }
  }
  await getPool().end();
}
