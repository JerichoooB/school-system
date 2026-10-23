import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Use an isolated TEST_DATABASE_URL ending in _test.");
const schema = `browser_${randomBytes(5).toString("hex")}`,
  base = "http://localhost:5175",
  password = "School browser password!";
let query, pool, api, vite, browser, page, sectionId;
const users = {},
  errors = [];
before(async () => {
  const database = new URL(url);
  database.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = database.toString();
  process.env.APP_URL = base;
  ({ query, getPool: pool } = await import("../server/db.js"));
  await query(`CREATE SCHEMA ${schema}`);
  for (const name of (
    await readdir(new URL("../db/migrations/", import.meta.url))
  ).sort())
    await query(
      await readFile(
        new URL(`../db/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  const hash = await bcrypt.hash(password, 4);
  for (const role of ["admin", "teacher", "student"])
    users[role] = (
      await query(
        "INSERT INTO users(name,email,password,role,email_verified) VALUES($1,$2,$3,$4,1) RETURNING *",
        [`${role} User`, `${role}@example.test`, hash, role],
      )
    ).rows[0];
  const department = (
    await query(
      "INSERT INTO departments(name) VALUES('Computing') RETURNING id",
    )
  ).rows[0];
  const term = (
    await query(
      "INSERT INTO terms(name,starts_on,ends_on) VALUES('2026–2030','2026-01-01','2030-12-31') RETURNING id",
    )
  ).rows[0];
  const course = (
    await query(
      "INSERT INTO courses(code,name,credits,department_id) VALUES('CS101','Database Systems',3,$1) RETURNING id",
      [department.id],
    )
  ).rows[0];
  const section = (
    await query(
      "INSERT INTO sections(course_id,term_id,teacher_id,name,capacity) VALUES($1,$2,$3,'A',20) RETURNING id",
      [course.id, term.id, users.teacher.id],
    )
  ).rows[0];
  sectionId = section.id;
  await query("INSERT INTO enrollments(section_id,student_id) VALUES($1,$2)", [
    sectionId,
    users.student.id,
  ]);
  const { default: handler } = await import("../server/handler.js");
  api = createServer(handler);
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  vite = await createViteServer({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    define: { "import.meta.env.VITE_GOOGLE_CLIENT_ID": JSON.stringify("") },
    server: {
      host: "127.0.0.1",
      port: 5175,
      strictPort: true,
      proxy: { "/api": { target: `http://127.0.0.1:${api.address().port}` } },
    },
    logLevel: "error",
  });
  await vite.listen();
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
});
after(async () => {
  await browser?.close();
  await vite?.close();
  if (api) await new Promise((r) => api.close(r));
  if (query) {
    await query(`DROP SCHEMA ${schema} CASCADE`);
    await pool().end();
  }
});
async function login(role) {
  await page.goto(base);
  await page.getByLabel("Email address").fill(users[role].email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${base}/dashboard`);
  await page.getByRole("heading", { name: `Welcome back, ${role}.` }).waitFor();
}
async function signout() {
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL(`${base}/`);
}
async function open(path) {
  await page.goto(`${base}/${path}`);
  await page.locator(".sh-app").waitFor();
}
async function saveDialog() {
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/school?resource=") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const res = await response;
  assert.equal(res.status(), 200, await res.text());
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
test("approved school screens and role workflows work in a real browser", async (t) => {
  await login("admin");
  await t.test(
    "all 13 administrator screens load without fake data or broken routes",
    async () => {
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
        "students",
        "teachers",
        "settings",
        "help",
      ]) {
        await open(path);
        assert.equal(
          await page.locator(".sh-main h1").textContent(),
          path === "help"
            ? "Help & Support"
            : path[0].toUpperCase() + path.slice(1),
        );
        assert.equal(await page.locator(".sh-main .sh-error").count(), 0, path);
      }
    },
  );
  await t.test("sidebar navigation reuses the workspace without session or data reloads", async () => {
    await open("dashboard");
    await page.locator(".sh-app").evaluate(el => { el.dataset.navigationCheck = "persisted"; });
    const reads = [];
    const track = req => {
      if (req.method() === "GET" && /\/api\/(session|school)(?:\?|$)/.test(req.url())) reads.push(req.url());
    };
    page.on("request", track);
    try {
      for (const name of ["Profile", "Settings", "Courses", "Grades", "Help & Support", "Dashboard"]) {
        await page.locator(".sh-sidebar").getByRole("link", { name, exact: true }).click();
        await page.locator(".sh-main h1").filter({ hasText: name }).waitFor();
        assert.equal(await page.locator(".sh-app").getAttribute("data-navigation-check"), "persisted");
        assert.equal(await page.getByText("Loading your school workspace…", { exact: true }).count(), 0);
      }
      assert.deepEqual(reads, [], "ordinary navigation should not wait on either API");
    } finally {
      page.off("request", track);
    }
  });
  await t.test("persistent workspace refreshes in the background and rejects revoked access", async () => {
    await page.clock.install();
    await open("dashboard");
    const refresh = page.waitForResponse(r => r.url() === `${base}/api/school` && r.request().method() === "GET");
    await page.clock.fastForward(61000);
    assert.equal((await refresh).status(), 200);
    await page.locator(".sh-main h1").waitFor();
    try {
      await query("UPDATE users SET status='inactive' WHERE id=$1", [users.admin.id]);
      const denied = page.waitForResponse(r => r.url() === `${base}/api/school` && r.status() === 403);
      await page.clock.fastForward(61000);
      await denied;
      await page.waitForURL(`${base}/`);
      await page.getByLabel("Email address").waitFor();
    } finally {
      await query("UPDATE users SET status='active' WHERE id=$1", [users.admin.id]);
    }
    await login("admin");
  });
  await t.test(
    "administrator creates a room through the academic setup form",
    async () => {
      await open("courses");
      await page.getByRole("button", { name: "rooms", exact: true }).click();
      await page
        .getByRole("button", { name: "Add record", exact: true })
        .click();
      await page.getByLabel("Room name", { exact: true }).fill("Lab 101");
      await page.getByLabel("Capacity", { exact: true }).fill("30");
      await saveDialog();
      await page.getByRole("cell", { name: "Lab 101", exact: true }).waitFor();
    },
  );
  await signout();
  await login("teacher");
  await t.test(
    "teacher creates and publishes an assignment through the form",
    async () => {
      await open("assignments");
      await page
        .getByRole("button", { name: "Create assignment", exact: true })
        .click();
      await page.getByLabel("Class", { exact: true }).selectOption(sectionId);
      await page.getByLabel("Title", { exact: true }).fill("Browser project");
      await page.getByLabel("Maximum points", { exact: true }).fill("100");
      await page.getByLabel("Weight (%)", { exact: true }).fill("100");
      await page
        .getByLabel("Instructions", { exact: true })
        .fill("Submit a database design.");
      await page
        .getByLabel("Due date and time", { exact: true })
        .fill("2030-01-01T12:00");
      await page.getByLabel("Publish to students", { exact: true }).check();
      await saveDialog();
      await page
        .getByRole("heading", { name: "Browser project", exact: true })
        .waitFor();
    },
  );
  await signout();
  await login("student");
  await t.test(
    "student submits work and cannot reach administration pages",
    async () => {
      assert.equal(
        await page.getByRole("link", { name: "Students", exact: true }).count(),
        0,
      );
      await open("students");
      await page.waitForURL(`${base}/dashboard`);
      await open("assignments");
      await page
        .getByRole("button", { name: "Submit assignment", exact: true })
        .click();
      await page
        .getByLabel("Your answer", { exact: true })
        .fill("A normalized design with foreign keys.");
      await saveDialog();
      await page
        .getByRole("button", { name: "Submitted", exact: true })
        .click();
      await page.getByText(/^Submitted /).waitFor();
    },
  );
  await t.test(
    "profile and preferences persist through a refresh",
    async () => {
      await open("profile");
      await page
        .getByRole("button", { name: "Edit profile", exact: true })
        .click();
      await page
        .getByLabel("Phone (optional)", { exact: true })
        .fill("09123456789");
      await saveDialog();
      await page.reload();
      await page.getByText("09123456789", { exact: true }).waitFor();
    },
  );
  await t.test("avatar upload, replacement and removal update profile, header and sidebar together", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    const fixtureIds = [];
    // Substitute Blob delivery only; uploads refresh actual role-scoped database data.
    await page.route("**/api/file**", async route => {
      const req = route.request();
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        const file = (await query("INSERT INTO files(owner_id,purpose,pathname,name,content_type,bytes) VALUES($1,'avatar',$2,$3,'image/png',$4) RETURNING *", [users.student.id, `avatar-${randomBytes(8).toString("hex")}`, body.name, png.length])).rows[0];
        fixtureIds.push(file.id);
        await route.fulfill({json:{success:true,file}});
      } else if (req.method() === "DELETE") {
        const id = new URL(req.url()).searchParams.get("id");
        await query("DELETE FROM files WHERE id=$1 AND owner_id=$2", [id, users.student.id]);
        await route.fulfill({json:{success:true}});
      } else {
        await route.fulfill({contentType:"image/png",body:png});
      }
    });
    try {
      await open("profile");
      for (const name of ["first-avatar.png", "replacement-avatar.png"]) {
        const refreshed = page.waitForResponse(r => r.url() === `${base}/api/school` && r.request().method() === "GET");
        await page.getByLabel("Upload profile photos", {exact:true}).setInputFiles({name,mimeType:"image/png",buffer:png});
        await refreshed;
        const src = `/api/file?id=${fixtureIds.at(-1)}`;
        for (const selector of [".sh-profile-banner .sh-avatar img", ".sh-user .sh-avatar img", 'a[aria-label="Your profile"] img']) {
          await page.locator(`${selector}[src="${src}"]`).waitFor();
          await page.waitForFunction(sel => document.querySelector(sel)?.naturalWidth > 0, selector);
        }
      }
      await page.locator(".sh-sidebar").getByRole("link", {name:"Settings",exact:true}).click();
      assert.equal(await page.locator('.sh-user .sh-avatar img').getAttribute("src"), `/api/file?id=${fixtureIds.at(-1)}`);
      await page.locator(".sh-sidebar").getByRole("link", {name:"Profile",exact:true}).click();
      for (const name of ["replacement-avatar.png", "first-avatar.png"]) {
        const refreshed = page.waitForResponse(r => r.url() === `${base}/api/school` && r.request().method() === "GET");
        await page.getByRole("button", {name:`Delete ${name}`,exact:true}).click();
        await refreshed;
      }
      await page.waitForFunction(() => document.querySelectorAll(".sh-avatar img").length === 0);
      assert.equal(await page.locator('.sh-user .sh-avatar').textContent(), "s");
      assert.equal(await page.locator('a[aria-label="Your profile"]').textContent(), "s");
    } finally {
      await page.unroute("**/api/file**");
      await query("DELETE FROM files WHERE id=ANY($1::bigint[])", [fixtureIds]);
    }
  });
  await signout();
  await login("teacher");
  await t.test("teacher releases a score for the submitted work", async () => {
    await open("grades");
    await page
      .getByRole("button", { name: "Enter score", exact: true })
      .click();
    await page
      .getByLabel("Assessment", { exact: true })
      .selectOption({ label: "Browser project" });
    await page
      .getByLabel("Student", { exact: true })
      .selectOption(users.student.id);
    await page.getByLabel("Points earned", { exact: true }).fill("92");
    await page
      .getByLabel("Feedback (optional)", { exact: true })
      .fill("Excellent design");
    await page.getByLabel("Release to student", { exact: true }).check();
    await saveDialog();
  });
  await signout();
  await login("student");
  await t.test(
    "student sees released feedback and dashboard totals",
    async () => {
      await open("grades");
      await page
        .getByRole("cell", { name: "Excellent design", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("cell", { name: "92.00 / 100.00", exact: true })
          .count(),
        1,
      );
      await open("dashboard");
      await page.getByText("92.0%", { exact: true }).first().waitFor();
      await mkdir("/workspace/schoolhub-ui-previews", { recursive: true });
      await page.screenshot({
        path: "/workspace/schoolhub-ui-previews/dashboard-implemented.png",
        fullPage: true,
      });
    },
  );
  await t.test(
    "mobile pages fit the viewport and navigation works",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
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
        await open(path);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
          path,
        );
      }
      await page
        .getByRole("button", { name: "Toggle navigation", exact: true })
        .click();
      await page.getByRole("link", { name: "Dashboard", exact: true }).click();
      await page.waitForURL(`${base}/dashboard`);
    },
  );
  await t.test('student screens pass automated accessibility checks in light and dark themes', async () => {
    await page.setViewportSize({width:1280,height:900});
    for(const path of ['dashboard','profile','courses','schedule','grades','attendance','assignments','announcements','exams','settings','help']){
      await open(path);await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
      const result=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
      assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],path);
    }
    await page.getByRole('button',{name:'Toggle theme',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
    await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
    const dark=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
    assert.deepEqual(dark.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],'dark theme');
  });
  assert.deepEqual(errors, []);
});
