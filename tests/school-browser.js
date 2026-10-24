import { test, before, after, mock } from "node:test";
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
  if (process.env.UI_REVIEW === "1") await mkdir("/workspace/schoolhub-ui-previews/polished", {recursive:true});
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
        if (process.env.UI_REVIEW === "1") await page.screenshot({path:`/workspace/schoolhub-ui-previews/polished/${path}-desktop.png`,fullPage:true});
      }
      await page.setViewportSize({width:390,height:844});
      for (const path of ["students", "teachers"]) {
        await open(path);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `mobile admin ${path}`);
        await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
        const issues = await page.evaluate(async () => (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id));
        assert.deepEqual(issues, [], `mobile admin ${path}`);
        if (process.env.UI_REVIEW === "1") await page.screenshot({path:`/workspace/schoolhub-ui-previews/polished/${path}-mobile.png`,fullPage:true});
      }
      await page.setViewportSize({width:1280,height:900});
    },
  );
  await t.test("settings edit inline with cancel, validation, persistence and password confirmation", async () => {
    await open("settings");
    const preferences = page.locator('.sh-card').filter({has:page.getByRole('heading',{name:'Preferences',exact:true})});
    await preferences.getByRole('button',{name:'Edit preferences',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),0);
    await preferences.getByLabel('Timezone',{exact:true}).fill('Invalid/Timezone');
    await preferences.getByRole('button',{name:'Save changes',exact:true}).click();
    await preferences.getByRole('alert').waitFor();
    assert.equal(await preferences.getByLabel('Timezone',{exact:true}).inputValue(),'Invalid/Timezone');
    await preferences.getByRole('button',{name:'Cancel',exact:true}).click();
    await preferences.getByRole('button',{name:'Edit preferences',exact:true}).click();
    assert.equal(await preferences.getByLabel('Timezone',{exact:true}).inputValue(),'Asia/Manila');
    await preferences.getByLabel('Timezone',{exact:true}).fill('Asia/Singapore');
    await preferences.getByLabel('Grade notifications',{exact:true}).uncheck();
    await preferences.getByRole('button',{name:'Save changes',exact:true}).click();
    await preferences.getByRole('button',{name:'Edit preferences',exact:true}).waitFor();
    await preferences.getByText('Asia/Singapore',{exact:true}).waitFor();
    const policies=page.locator('.sh-card').filter({has:page.getByRole('heading',{name:'School policies',exact:true})});
    await policies.getByRole('button',{name:'Edit school settings',exact:true}).click();
    await policies.getByLabel('School name',{exact:true}).fill('Browser School');
    await policies.getByRole('button',{name:'Save changes',exact:true}).click();
    await policies.getByRole('button',{name:'Edit school settings',exact:true}).waitFor();
    await page.reload();await page.locator('.sh-app').waitFor();
    await policies.getByText('Browser School',{exact:true}).waitFor();
    await preferences.getByText('Asia/Singapore',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Change password',exact:true}).click();
    const passwordForm=page.getByRole('form',{name:'Edit password',exact:true});
    await passwordForm.getByLabel('Current password',{exact:true}).fill(password);
    await passwordForm.getByLabel('New password',{exact:true}).fill('New valid password 123!');
    await passwordForm.getByLabel('Confirm new password',{exact:true}).fill('Different password 123!');
    await passwordForm.getByRole('button',{name:'Save changes',exact:true}).click();
    await passwordForm.getByText('New passwords do not match.',{exact:true}).waitFor();
    await passwordForm.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),0);
  });
  await t.test("grading policies and help articles save directly in their sections", async () => {
    await open('grades');
    const grading=page.locator('.sh-card').filter({has:page.getByRole('heading',{name:'School grading scale',exact:true})});
    await grading.getByRole('button',{name:'Edit grading policy',exact:true}).click();
    await grading.getByLabel('Late penalty (% of maximum points)',{exact:true}).fill('5');
    await grading.getByRole('button',{name:'Save changes',exact:true}).click();
    await grading.getByRole('button',{name:'Edit grading policy',exact:true}).waitFor();
    assert.equal(Number((await query("SELECT value FROM school_settings WHERE key='grading'")).rows[0].value.late_penalty_percent),5);
    const article=(await query("INSERT INTO help_articles(title,content,category,published) VALUES('Browser FAQ','Original answer','General',true) RETURNING id")).rows[0];
    await open('help');
    const faq=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Browser FAQ'})});
    await faq.locator('summary').click();
    await faq.getByRole('button',{name:'Edit article',exact:true}).click();
    await faq.getByLabel('Answer',{exact:true}).fill('Updated inline answer');
    await faq.getByRole('button',{name:'Save changes',exact:true}).click();
    await faq.getByText('Updated inline answer',{exact:true}).waitFor();
    assert.equal((await query('SELECT content FROM help_articles WHERE id=$1',[article.id])).rows[0].content,'Updated inline answer');
    assert.equal(await page.getByRole('dialog').count(),0);
  });
  await t.test("table page sizes, sorting and empty-search recovery work", async () => {
    const ids = [];
    try {
      for (let n=0;n<10;n++) ids.push((await query("INSERT INTO users(name,email,password,email_verified) VALUES($1,$2,$3,1) RETURNING id", [`Table person ${n}`,`table-${n}@example.test`,users.student.password])).rows[0].id);
      await open('settings');
      const accounts=page.locator('.sh-card').filter({has:page.getByRole('heading',{name:'Account administration',exact:true})});
      assert.equal(await accounts.locator('tbody tr').count(),8);
      await accounts.getByLabel('Rows per page',{exact:true}).selectOption('20');
      assert.equal(await accounts.locator('tbody tr').count(),13);
      await accounts.getByRole('button',{name:'Name',exact:true}).click();
      assert.equal(await accounts.locator('th').first().getAttribute('aria-sort'),'ascending');
      await accounts.getByRole('button',{name:/^Name/}).click();
      assert.equal(await accounts.locator('th').first().getAttribute('aria-sort'),'descending');
      await accounts.getByLabel('Search records',{exact:true}).fill('No matching person');
      await accounts.getByText('No results for “No matching person”. Try another name or keyword.',{exact:true}).waitFor();
      await accounts.getByRole('button',{name:'Clear search',exact:true}).click();
      assert.equal(await accounts.locator('tbody tr').count(),13);
    } finally { await query('DELETE FROM users WHERE id=ANY($1::bigint[])',[ids]); }
  });
  await t.test("notification filters, mark-read, outside dismissal and Escape work", async () => {
    await query("INSERT INTO notifications(user_id,title,href) VALUES($1,'UI test notification','/courses')",[users.admin.id]);
    await open('dashboard');
    const trigger=page.getByRole('button',{name:'Notifications',exact:true});
    await trigger.click();
    const center=page.getByRole('region',{name:'Notification center',exact:true});
    await center.getByRole('link',{name:/^UI test notification/}).waitFor();
    await center.getByRole('button',{name:/^Unread/}).click();
    await center.getByRole('button',{name:'Mark all read',exact:true}).click();
    await center.getByText('No unread notifications. You’re all caught up.',{exact:true}).waitFor();
    assert.equal(await center.getByRole('button',{name:'Mark all read',exact:true}).isDisabled(),true);
    await page.keyboard.press('Escape');
    assert.equal(await center.count(),0);
    assert.equal(await trigger.evaluate(el=>document.activeElement===el),true);
    await trigger.click();
    await page.locator('.sh-main h1').click();
    assert.equal(await center.count(),0);
  });
  await t.test("guided setup supports quick departments, inline edits, relationships and safe deletion", async () => {
    await open('courses');
    const catalog=page.locator('#course-catalog');
    await catalog.getByRole('button',{name:'Create course',exact:true}).click();
    const form=catalog.getByRole('form',{name:'Edit course catalog',exact:true});
    await form.getByLabel('Course code',{exact:true}).fill('SETUP101');
    await form.getByLabel('Course name',{exact:true}).fill('Setup workflow subject');
    await form.getByRole('button',{name:'Add a new department',exact:true}).click();
    await form.getByLabel('New department name',{exact:true}).fill('Setup department');
    await form.getByRole('button',{name:'Add department',exact:true}).click();
    await form.getByRole('option',{name:'Setup department',exact:true}).waitFor({state:'attached'});
    const dept=(await query("SELECT id FROM departments WHERE name='Setup department'")).rows[0];
    assert.equal(await form.getByLabel('Department (optional)',{exact:true}).inputValue(),String(dept.id));
    assert.equal(await form.getByLabel('Course name',{exact:true}).inputValue(),'Setup workflow subject');
    await form.getByRole('button',{name:'Create course',exact:true}).click();
    await form.waitFor({state:'hidden'});
    const setup=page.locator('.sh-card').filter({has:page.getByRole('heading',{name:'Academic setup',exact:true})});
    assert.equal(await setup.getByRole('group',{name:'Academic setup steps',exact:true}).getByRole('button').count(),6);
    await setup.getByRole('button',{name:'Departments',exact:true}).click();
    let row=setup.getByRole('row').filter({hasText:'Setup department'});
    await row.getByText('SETUP101',{exact:true}).waitFor();
    await row.getByRole('button',{name:'Edit',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),0);
    const editor=setup.getByRole('form',{name:'Edit academic departments',exact:true});
    await editor.getByLabel('Department name',{exact:true}).fill('Updated setup department');
    await editor.getByRole('button',{name:'Save changes',exact:true}).click();
    await editor.waitFor({state:'hidden'});
    row=setup.getByRole('row').filter({hasText:'Updated setup department'});
    await row.getByRole('button',{name:'Delete',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('button',{name:'Delete record',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:'1 course'}).waitFor();
    assert.equal(Number((await query('SELECT count(*) FROM departments WHERE id=$1',[dept.id])).rows[0].count),1);
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await setup.locator('.sh-tabs').getByRole('button',{name:'Courses',exact:true}).click();
    assert.equal(await setup.getByRole('button',{name:'Add course',exact:true}).count(),0);
    await setup.getByRole('row').filter({hasText:'SETUP101'}).getByText('Updated setup department',{exact:true}).waitFor();
  });
  await t.test("new courses and teacher invitations are distinct from class assignment", async () => {
    await open('courses');
    const catalog=page.locator('.sh-card').filter({has:page.getByRole('heading',{name:'Course catalog',exact:true})});
    await catalog.getByRole('button',{name:'Create course',exact:true}).click();
    await catalog.getByLabel('Course code',{exact:true}).fill('CS202');
    await catalog.getByLabel('Course name',{exact:true}).fill('New catalog course');
    await catalog.getByLabel('Description (optional)',{exact:true}).fill('Created as a subject, before assigning a class.');
    await catalog.getByRole('form',{name:'Edit course catalog',exact:true}).getByRole('button',{name:'Create course',exact:true}).click();
    await catalog.getByRole('form',{name:'Edit course catalog',exact:true}).waitFor({state:'hidden'});
    await catalog.getByRole('button',{name:'Create course',exact:true}).waitFor();
    assert.equal((await query("SELECT name FROM courses WHERE code='CS202'")).rows[0].name,'New catalog course');
    await page.getByRole('button',{name:'Create class',exact:true}).click();
    await page.getByRole('dialog').getByLabel('Course',{exact:true}).selectOption({label:'CS202 · New catalog course'});
    await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
    await query("UPDATE users SET status='inactive' WHERE id=$1",[users.teacher.id]);
    try {
      await open('courses');
      assert.equal(await page.getByRole('button',{name:'Create class',exact:true}).isDisabled(),true);
      await page.getByRole('link',{name:'Invite a teacher',exact:true}).waitFor();
    } finally { await query("UPDATE users SET status='active' WHERE id=$1",[users.teacher.id]); }
    const previous=Object.fromEntries(['MAIL_PROVIDER','GMAIL_USER','GMAIL_APP_PASSWORD'].map(k=>[k,process.env[k]]));
    Object.assign(process.env,{MAIL_PROVIDER:'gmail',GMAIL_USER:'sender@example.test',GMAIL_APP_PASSWORD:'abcdefghijklmnop'});
    const {default:nodemailer}=await import('nodemailer');
    const delivered=[];
    const smtp=mock.method(nodemailer,'createTransport',()=>({async sendMail(message){delivered.push(message);return {accepted:[message.to]};}}));
    try {
      await open('teachers');
      await page.getByRole('button',{name:'Invite teacher',exact:true}).click();
      const invite=page.getByRole('form',{name:'Edit invite a new teacher',exact:true});
      await invite.getByLabel('Full name (optional)',{exact:true}).fill('New Faculty');
      await invite.getByLabel('Email address',{exact:true}).fill('new-faculty@example.test');
      assert.equal(await invite.locator('select').count(),0);
      await invite.getByRole('button',{name:'Send invitation',exact:true}).click();
      await page.getByRole('button',{name:'Invite teacher',exact:true}).waitFor();
      assert.equal((await query("SELECT role FROM invitations WHERE email='new-faculty@example.test'")).rows[0].role,'teacher');
      assert.match(delivered[0].text,/Hello New Faculty/);
      assert.match(delivered[0].text,/invited as a teacher/);
    } finally {
      smtp.mock.restore();
      for(const [key,value] of Object.entries(previous)) {if(value===undefined) delete process.env[key];else process.env[key]=value;}
    }
  });
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
      await page.getByRole("button", { name: "Rooms", exact: true }).click();
      await page
        .getByRole("button", { name: "Add room", exact: true })
        .click();
      await page.getByLabel("Room name", { exact: true }).fill("Lab 101");
      await page.getByLabel("Capacity", { exact: true }).fill("30");
      assert.equal(await page.getByRole("dialog").count(),0);
      const editor=page.getByRole("form",{name:"Edit academic rooms",exact:true});
      await editor.getByRole("button",{name:"Save changes",exact:true}).click();
      await editor.waitFor({state:"hidden"});
      await page.getByRole("cell", { name: "Lab 101", exact: true }).waitFor();
    },
  );
  await signout();
  await login("teacher");
  await t.test("staff profile shows teaching details rather than student-only fields", async () => {
    await open('profile');
    await page.getByRole('heading',{name:'Teaching & school information',exact:true}).waitFor();
    assert.equal(await page.getByText('Student number',{exact:true}).count(),0);
    await page.getByText('Assigned classes',{exact:true}).waitFor();
  });
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
    "personal and emergency cards edit inline, cancel drafts and preserve each other after refresh",
    async () => {
      await open("profile");
      const card = page.locator(".sh-card").filter({has: page.getByRole("heading", {name:"Personal information",exact:true})});
      const editButton = card.getByRole("button", {name:"Edit profile",exact:true});
      await editButton.click();
      assert.equal(await page.getByRole("dialog").count(), 0);
      await card.getByLabel("Phone (optional)", {exact:true}).fill("Discard this draft");
      await card.getByRole("button", {name:"Cancel",exact:true}).click();
      await editButton.click();
      assert.equal(await card.getByLabel("Phone (optional)", {exact:true}).inputValue(), "");
      await card.getByLabel("Phone (optional)", {exact:true}).fill("09123456789");
      const saved = page.waitForResponse(r => r.url().includes("/api/school?resource=profile") && r.request().method() === "POST");
      await card.getByRole("button", {name:"Save changes",exact:true}).click();
      assert.equal((await saved).status(), 200);
      await card.getByRole("button", {name:"Edit profile",exact:true}).waitFor();
      const emergencyCard = page.locator(".sh-card").filter({has: page.getByRole("heading", {name:"Emergency contact",exact:true})});
      await emergencyCard.getByRole("button", {name:"Edit emergency contact",exact:true}).click();
      assert.equal(await page.getByRole("dialog").count(), 0);
      await emergencyCard.getByLabel("Emergency contact name (optional)", {exact:true}).fill("Discarded contact");
      await emergencyCard.getByRole("button", {name:"Cancel",exact:true}).click();
      await emergencyCard.getByRole("button", {name:"Edit emergency contact",exact:true}).click();
      assert.equal(await emergencyCard.getByLabel("Emergency contact name (optional)", {exact:true}).inputValue(), "");
      await emergencyCard.getByLabel("Emergency contact name (optional)", {exact:true}).fill("Family contact");
      await emergencyCard.getByLabel("Emergency contact phone (optional)", {exact:true}).fill("09987654321");
      await emergencyCard.getByRole("button", {name:"Save changes",exact:true}).click();
      await emergencyCard.getByRole("button", {name:"Edit emergency contact",exact:true}).waitFor();
      await card.getByText("09123456789", {exact:true}).waitFor();
      // Saving personal information must preserve the separately edited contact.
      await editButton.click();
      await card.getByLabel("Address (optional)", {exact:true}).fill("School address");
      await card.getByRole("button", {name:"Save changes",exact:true}).click();
      await editButton.waitFor();
      await emergencyCard.getByText("Family contact", {exact:true}).waitFor();
      await page.reload();
      await page.getByText("09123456789", { exact: true }).waitFor();
      await page.getByText("Family contact", {exact:true}).waitFor();
      await page.getByText("09987654321", {exact:true}).waitFor();
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
      await page.getByLabel("Upload profile photos", {exact:true}).setInputFiles({name:'cancelled.png',mimeType:'image/png',buffer:png});
      await page.getByRole('button',{name:'Cancel photo',exact:true}).click();
      assert.equal(fixtureIds.length,0,'preview cancellation must not upload');
      await page.getByLabel("Upload profile photos", {exact:true}).setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('Not a photo')});
      await page.getByText('Choose a PNG, JPEG or WebP photo.',{exact:true}).waitFor();
      assert.equal(fixtureIds.length,0,'unsupported photo must not upload');

      for (const name of ["first-avatar.png", "replacement-avatar.png"]) {
        const refreshed = page.waitForResponse(r => r.url() === `${base}/api/school` && r.request().method() === "GET");
        await page.getByLabel("Upload profile photos", {exact:true}).setInputFiles({name,mimeType:"image/png",buffer:png});
        await page.getByRole('img',{name:'Preview of your selected profile photo',exact:true}).waitFor();
        await page.getByRole('button',{name:'Use this photo',exact:true}).click();
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
        await page.getByRole('group',{name:'Confirm file removal',exact:true}).getByRole('button',{name:'Remove file',exact:true}).click();
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
        if (process.env.UI_REVIEW === "1") await page.screenshot({path:`/workspace/schoolhub-ui-previews/polished/${path}-mobile.png`,fullPage:true});
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
          path,
        );
      }
      const quickNav = page.getByRole('navigation',{name:'Quick navigation',exact:true});
      await quickNav.getByRole('link',{name:'Open schedule',exact:true}).click();
      await page.waitForURL(`${base}/schedule`);
      await quickNav.locator('a[href="/schedule"][aria-current="page"]').waitFor();
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
    for(const path of ['dashboard','profile','courses','schedule','grades','attendance','assignments','announcements','exams','settings','help']) {
      await open(path);
      await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
      const dark=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
      assert.deepEqual(dark.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],`dark ${path}`);
      if(process.env.UI_REVIEW === "1") await page.screenshot({path:`/workspace/schoolhub-ui-previews/polished/${path}-dark.png`,fullPage:true});
    }
  });
  assert.deepEqual(errors, []);
});
