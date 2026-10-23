import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { query, getPool } from "../server/db.js";
import { zonedISO } from "../shared/time.js";

if (process.env.LIVE_ACADEMIC_TEST !== "1")
  throw new Error(
    "Set LIVE_ACADEMIC_TEST=1 to authorize creation and cleanup of temporary academic fixtures.",
  );
const base = new URL(
  process.env.SMOKE_BASE_URL || "https://schoolhub-ri.vercel.app",
).origin;
if (!base.startsWith("https://") && !base.startsWith("http://localhost:"))
  throw new Error("Remote tests require HTTPS.");
const prefix = `QA-${randomBytes(7).toString("hex")}`,
  password = randomBytes(24).toString("base64url") + "!a";
const actors = {},
  emails = [],
  ownedFiles = new Set();
let checks = 0;
const today = new Date().toISOString().slice(0, 10);
const later = (days) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const stamp = (value) => new Date(value).toISOString();
async function request(
  role,
  path,
  body,
  expected = 200,
  method = body === undefined ? "GET" : "POST",
) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(actors[role]?.cookie ? { Cookie: actors[role].cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${path}: ${data.message || response.status}`,
  );
  checks++;
  return data;
}
const school = (role, resource, body, status = 200) =>
  request(
    role,
    `school${resource ? `?resource=${resource}` : ""}`,
    body,
    status,
  );
const create = async (role, resource, body) =>
  (await school(role, resource, body)).record;
async function login(role, secret = actors[role].password) {
  const response = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email: actors[role].email, password: secret }),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(
    response.status,
    200,
    `Cannot sign in temporary ${role} account.`,
  );
  actors[role].cookie = response.headers.get("set-cookie").split(";")[0];
  checks++;
}
async function upload(role, body) {
  const file = (await request(role, "file", body)).file;
  ownedFiles.add(String(file.id));
  return file;
}
async function removeFile(role, id) {
  await request(role, `file?id=${id}`, undefined, 200, "DELETE");
  ownedFiles.delete(String(id));
}
async function download(role, id, content, status = 200) {
  const response = await fetch(`${base}/api/file?id=${id}`, {
    headers: actors[role]?.cookie ? { Cookie: actors[role].cookie } : {},
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, status);
  if (content !== undefined) assert.equal(await response.text(), content);
  checks++;
}

try {
  const hash = await bcrypt.hash(password, 12);
  for (const [role, access] of [
    ["admin", "admin"],
    ["teacher", "teacher"],
    ["student", "student"],
    ["outsider", "student"],
    ["otherTeacher", "teacher"],
  ]) {
    const email = `${prefix.toLowerCase()}-${role.toLowerCase()}@example.invalid`;
    emails.push(email);
    const account = (
      await query(
        "INSERT INTO users(name,email,password,role,email_verified) VALUES($1,$2,$3,$4,1) RETURNING id",
        [`${prefix} ${role}`, email, hash, access],
      )
    ).rows[0];
    actors[role] = { ...account, email, password };
    await query(
      "INSERT INTO profiles(user_id,notify_assignments,notify_announcements,notify_grades) VALUES($1,false,false,false)",
      [account.id],
    );
    await login(role);
  }
  console.log(
    "PASS live temporary administrator, teacher, student and unrelated accounts sign in",
  );
  const year = await create("admin", "academic_years", {
    name: `${prefix} year`,
    starts_on: today,
    ends_on: later(365),
  });
  const department = await create("admin", "departments", {
    name: `${prefix} department`,
  });
  const program = await create("admin", "programs", {
    name: `${prefix} program`,
    department_id: department.id,
  });
  const term = await create("admin", "terms", {
    name: `${prefix} term`,
    starts_on: today,
    ends_on: later(180),
    academic_year_id: year.id,
  });
  const room = await create("admin", "rooms", {
    name: `${prefix} room`,
    capacity: 30,
  });
  const course = await create("admin", "courses", {
    code: prefix.replaceAll("-", ""),
    name: `${prefix} course`,
    credits: 3,
    department_id: department.id,
    description: "Temporary deployment test.",
  });
  const section = await create("admin", "sections", {
    course_id: course.id,
    term_id: term.id,
    teacher_id: actors.teacher.id,
    name: `${prefix} A`,
    capacity: 1,
  });
  await create("admin", "people", {
    id: actors.student.id,
    role: "student",
    status: "active",
    student_number: `${prefix}-S`,
    program_id: program.id,
    year_level: 2,
  });
  await create("admin", "program_courses", {
    program_id: program.id,
    course_id: course.id,
    year_level: 2,
  });
  await create("admin", "teacher_departments", {
    teacher_id: actors.teacher.id,
    department_id: department.id,
  });
  await create("admin", "enrollments", {
    section_id: section.id,
    student_id: actors.student.id,
    status: "active",
  });
  await school(
    "admin",
    "enrollments",
    { section_id: section.id, student_id: actors.outsider.id },
    409,
  );
  await school(
    "student",
    "courses",
    { code: "NO", name: "Forbidden", credits: 3 },
    403,
  );
  await school(
    "admin",
    "people",
    { id: actors.admin.id, role: "student", status: "inactive" },
    400,
  );
  console.log(
    "PASS live academic setup, official student details, enrollment capacity and administrator permissions",
  );
  const meeting = await create("admin", "meetings", {
    section_id: section.id,
    room_id: room.id,
    weekday: 1,
    starts_at: "09:00",
    ends_at: "10:00",
  });
  await school(
    "admin",
    "meetings",
    {
      section_id: section.id,
      room_id: room.id,
      weekday: 1,
      starts_at: "09:30",
      ends_at: "10:30",
    },
    409,
  );
  const hours = await create("teacher", "office_hours", {
    weekday: 2,
    starts_at: "13:00",
    ends_at: "14:00",
    location: `${prefix} office`,
  });
  const event = await create("teacher", "schedule_exceptions", {
    section_id: section.id,
    title: `${prefix} cancellation`,
    kind: "cancellation",
    starts_at: zonedISO(`${later(2)}T09:00`, "Asia/Manila"),
    ends_at: zonedISO(`${later(2)}T10:00`, "Asia/Manila"),
  });
  console.log(
    "PASS live timetable, conflict rejection, office hours and calendar exceptions",
  );
  const material = await create("teacher", "materials", {
    section_id: section.id,
    title: `${prefix} syllabus`,
    content: "Learning resource test.",
  });
  await create("teacher", "content_update", {
    id: material.id,
    table: "materials",
    title: `${prefix} updated syllabus`,
    content: "Updated learning resource.",
    url: "https://example.invalid/resource",
  });
  await create("student", "resource_completions", {
    material_id: material.id,
    completed: true,
  });
  await school(
    "otherTeacher",
    "materials",
    { section_id: section.id, title: "Forbidden" },
    403,
  );
  const materialFile = await upload("teacher", {
    purpose: "material",
    section_id: section.id,
    name: "material.txt",
    content_type: "text/plain",
    base64: Buffer.from("Private course attachment").toString("base64"),
  });
  await download("student", materialFile.id, "Private course attachment");
  await download("outsider", materialFile.id, undefined, 404);
  await removeFile("teacher", materialFile.id);
  console.log(
    "PASS live learning materials, completion tracking and private class attachments",
  );
  const category = await create("teacher", "assessment_categories", {
    section_id: section.id,
    name: `${prefix} assessment`,
    weight: 100,
  });
  const assignmentBody = {
    section_id: section.id,
    title: `${prefix} project`,
    points: 100,
    weight: 100,
    category_id: category.id,
    instructions: "Submit a design.",
    due_at: zonedISO(`${later(7)}T23:00`, "Asia/Manila"),
    published: false,
  };
  const assignment = await create("teacher", "assignments", assignmentBody);
  assert.equal(
    (await school("student")).assignments.some(
      (a) => String(a.id) === String(assignment.id),
    ),
    false,
  );
  await school(
    "student",
    "submissions",
    { assignment_id: assignment.id, content: "Draft access should fail." },
    404,
  );
  await create("teacher", "assignments", {
    ...assignmentBody,
    id: assignment.id,
    published: true,
  });
  const sub = await create("student", "submissions", {
    assignment_id: assignment.id,
    content: "First submission.",
  });
  await create("student", "submissions", {
    assignment_id: assignment.id,
    content: "Updated submission.",
  });
  await school(
    "outsider",
    "submissions",
    { assignment_id: assignment.id, content: "Forbidden" },
    403,
  );
  const answerFile = await upload("student", {
    purpose: "submission",
    submission_id: sub.id,
    name: "answer.txt",
    content_type: "text/plain",
    base64: Buffer.from("Private submission attachment").toString("base64"),
  });
  await download("teacher", answerFile.id, "Private submission attachment");
  await download("outsider", answerFile.id, undefined, 404);
  await request(
    "teacher",
    `file?id=${answerFile.id}`,
    undefined,
    404,
    "DELETE",
  );
  await removeFile("student", answerFile.id);
  const criterion = await create("teacher", "rubrics", {
    assignment_id: assignment.id,
    title: "Correctness",
    maximum: 100,
  });
  await create("teacher", "rubric_scores", {
    submission_id: sub.id,
    criteria: [{ id: criterion.id, points: 90 }],
    feedback: "Verified rubric feedback",
    published: true,
  });
  let final = await create("teacher", "final_grades", {
    section_id: section.id,
    student_id: actors.student.id,
    published: true,
  });
  assert.equal(Number(final.percentage), 90);
  await create("student", "submissions", {
    assignment_id: assignment.id,
    content: "Resubmitted work invalidates the released grade.",
  });
  let state = await school("student");
  assert.equal(
    state.final_grades.some((g) => String(g.section_id) === String(section.id)),
    false,
  );
  assert.equal(
    state.scores.some(
      (g) => String(g.assessment_id) === String(assignment.assessment_id),
    ),
    false,
  );
  await create("teacher", "scores", {
    assessment_id: assignment.assessment_id,
    student_id: actors.student.id,
    points: 95,
    feedback: "Verified released feedback",
    published: true,
  });
  await create("teacher", "assignments", {
    ...assignmentBody,
    id: assignment.id,
    weight: 50,
    published: true,
  });
  const exam = await create("teacher", "exams", {
    section_id: section.id,
    title: `${prefix} exam`,
    points: 100,
    weight: 50,
    category_id: category.id,
    starts_at: zonedISO(`${later(3)}T14:00`, "Asia/Manila"),
    ends_at: zonedISO(`${later(3)}T15:00`, "Asia/Manila"),
    room_id: room.id,
    published: true,
  });
  await create("teacher", "scores", {
    assessment_id: exam.assessment_id,
    student_id: actors.student.id,
    points: 85,
    published: true,
  });
  final = await create("teacher", "final_grades", {
    section_id: section.id,
    student_id: actors.student.id,
    published: true,
  });
  assert.equal(Number(final.percentage), 90);
  await school(
    "teacher",
    "scores",
    {
      assessment_id: exam.assessment_id,
      student_id: actors.student.id,
      points: 101,
    },
    400,
  );
  if (process.env.LIVE_VERIFY_GRADING_FIX === "1") {
    await create("teacher", "assessment_archive", {
      id: exam.assessment_id,
      archived: true,
    });
    await create("teacher", "assignments", {
      ...assignmentBody,
      id: assignment.id,
      weight: 100,
      published: true,
    });
    await school(
      "teacher",
      "assessment_archive",
      { id: exam.assessment_id, archived: false },
      400,
    );
    await school(
      "teacher",
      "assignments",
      {
        ...assignmentBody,
        id: assignment.id,
        weight: 100,
        points: 90,
        published: true,
      },
      400,
    );
    await create("teacher", "assignments", {
      ...assignmentBody,
      id: assignment.id,
      weight: 50,
      published: true,
    });
    await create("teacher", "assessment_archive", {
      id: exam.assessment_id,
      archived: false,
    });
    assert.equal(
      Number(
        (
          await create("teacher", "final_grades", {
            section_id: section.id,
            student_id: actors.student.id,
            published: true,
          })
        ).percentage,
      ),
      90,
    );
    console.log(
      "PASS live archived-assessment weight and original-score regression checks",
    );
  }
  console.log(
    "PASS live assignment drafts, submissions/history, rubrics, grade publication, resubmission invalidation, exams and weighted final grades",
  );
  const session = await create("teacher", "class_sessions", {
    section_id: section.id,
    held_on: today,
    title: `${prefix} lecture`,
  });
  await create("teacher", "bulk_attendance", {
    session_id: session.id,
    status: "present",
  });
  await create("teacher", "attendance", {
    session_id: session.id,
    student_id: actors.student.id,
    status: "late",
    note: "Verified arrival correction",
  });
  await school(
    "teacher",
    "attendance",
    { session_id: session.id, student_id: actors.student.id, status: "absent" },
    400,
  );
  const announcement = await create("teacher", "announcements", {
    section_id: section.id,
    title: `${prefix} notice`,
    content: "Live announcement test.",
    pinned: true,
  });
  const future = await create("teacher", "announcements", {
    section_id: section.id,
    title: `${prefix} future notice`,
    content: "Scheduled test.",
    publish_at: stamp(Date.now() + 86400000),
  });
  state = await school("student");
  assert.equal(
    state.announcements.some((a) => String(a.id) === String(future.id)),
    false,
  );
  await create("student", "announcement_reads", { id: announcement.id });
  const announcementFile = await upload("teacher", {
    purpose: "announcement",
    announcement_id: announcement.id,
    name: "notice.txt",
    content_type: "text/plain",
    base64: Buffer.from("Private announcement attachment").toString("base64"),
  });
  await download(
    "student",
    announcementFile.id,
    "Private announcement attachment",
  );
  await download("outsider", announcementFile.id, undefined, 404);
  await removeFile("teacher", announcementFile.id);
  const teacherState = await school("teacher");
  const notice = teacherState.notifications.find(
    (n) => n.title === "New assignment submission",
  );
  if (notice) {
    await create("teacher", "notifications", { id: notice.id });
    assert.ok(
      (await school("teacher")).notifications.find(
        (n) => String(n.id) === String(notice.id),
      ).read_at,
    );
  }
  console.log(
    "PASS live attendance/bulk marking/corrections, announcement scheduling/reads/attachments and notifications",
  );
  await create("student", "profile", {
    name: `${prefix} updated student`,
    phone: "0000000000",
    address: "Temporary test",
    emergency_name: "Test contact",
    emergency_phone: "0000000000",
  });
  await create("student", "preferences", {
    timezone: "Asia/Manila",
    theme: "dark",
    notify_assignments: false,
    notify_announcements: false,
    notify_grades: false,
  });
  await school(
    "student",
    "preferences",
    { timezone: "Not/A_Timezone", theme: "dark" },
    400,
  );
  await create("admin", "import_people", {
    rows: [
      {
        email: actors.outsider.email,
        name: `${prefix} imported student`,
        role: "student",
        student_number: `${prefix}-O`,
        program_id: program.id,
        year_level: 1,
      },
    ],
  });
  const extraRoom = await create("admin", "rooms", {
    name: `${prefix} disposable room`,
    capacity: 10,
  });
  await create("admin", "catalog_update", {
    table: "rooms",
    id: extraRoom.id,
    name: `${prefix} edited room`,
    capacity: 12,
  });
  await create("admin", "catalog_delete", { table: "rooms", id: extraRoom.id });
  const article = await create("admin", "help_articles", {
    title: `${prefix} article`,
    content: "Temporary help article.",
    category: "Technical support",
    published: false,
  });
  assert.equal(
    (await school("student")).help_articles.some(
      (a) => String(a.id) === String(article.id),
    ),
    false,
  );
  await create("admin", "help_articles", { ...article, published: true });
  assert.equal(
    (await school("student")).help_articles.some(
      (a) => String(a.id) === String(article.id),
    ),
    true,
  );
  state = await school("student");
  assert.equal(state.profile[0].theme, "dark");
  assert.equal(state.profile[0].program_id, program.id);
  assert.equal(
    state.submission_versions.filter(
      (v) => String(v.submission_id) === String(sub.id),
    ).length,
    3,
  );
  assert.equal(
    state.scores.filter((g) => String(g.section_id) === String(section.id))
      .length,
    2,
  );
  assert.equal(
    state.attendance.find((a) => String(a.session_id) === String(session.id))
      .status,
    "late",
  );
  assert.ok(
    state.announcements.find((a) => String(a.id) === String(announcement.id))
      .read_at,
  );
  const unauthorized = await school("otherTeacher");
  assert.equal(
    unauthorized.sections.some((s) => String(s.id) === String(section.id)),
    false,
  );
  assert.equal(
    unauthorized.scores.some(
      (s) => String(s.section_id) === String(section.id),
    ),
    false,
  );
  const replacement = randomBytes(24).toString("base64url") + "!a";
  await create("student", "password", {
    current_password: password,
    password: replacement,
  });
  actors.student.password = replacement;
  await request("student", "session", undefined, 401);
  await login("student");
  await create("admin", "people", {
    id: actors.outsider.id,
    role: "student",
    status: "inactive",
  });
  await request("outsider", "session", undefined, 401);
  console.log(
    "PASS live profiles/preferences, validated imports, catalog editing, help publishing, password/session revocation and inactive-account protection",
  );
  await create("admin", "enrollments", {
    section_id: section.id,
    student_id: actors.student.id,
    status: "withdrawn",
  });
  await school(
    "student",
    "submissions",
    {
      assignment_id: assignment.id,
      content: "Withdrawn student cannot submit.",
    },
    403,
  );
  assert.ok(
    (await school("student")).final_grades.some(
      (g) => String(g.section_id) === String(section.id),
    ),
  );
  await create("admin", "enrollments", {
    section_id: section.id,
    student_id: actors.student.id,
    status: "active",
  });
  await create("admin", "sections", { id: section.id, archived: true });
  await school(
    "teacher",
    "materials",
    { section_id: section.id, title: "Archived write" },
    409,
  );
  await create("admin", "sections", { id: section.id, archived: false });
  await create("teacher", "office_hours", { id: hours.id, remove: true });
  await create("teacher", "content_delete", {
    table: "schedule_exceptions",
    id: event.id,
  });
  await create("teacher", "content_delete", {
    table: "meetings",
    id: meeting.id,
  });
  console.log(
    `PASS live academic workflow: ${checks} HTTP assertions; cron and external message delivery intentionally excluded`,
  );
} catch (error) {
  console.error("Live academic check failed:", error.message);
  process.exitCode = 1;
} finally {
  await cleanupAcademicFixtures();
  await getPool().end();
}
async function cleanupAcademicFixtures() {
  try {
    const ids = (
      await query("SELECT id FROM users WHERE email=ANY($1::text[])", [emails])
    ).rows.map((r) => r.id);
    if (ids.length) {
      const files = (
        await query("SELECT id FROM files WHERE owner_id=ANY($1::bigint[])", [
          ids,
        ])
      ).rows;
      for (const f of files) {
        if (!actors.admin.cookie) await login("admin");
        await removeFile("admin", f.id);
      }
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const sections = (
          await client.query(
            "SELECT id FROM sections WHERE teacher_id=ANY($1::bigint[])",
            [ids],
          )
        ).rows.map((s) => s.id);
        const externalFiles = await client.query(
          "SELECT 1 FROM files WHERE section_id=ANY($1::bigint[])",
          [sections],
        );
        if (externalFiles.rowCount)
          throw new Error(
            "Unexpected files on temporary class; cleanup paused to preserve data.",
          );
        const subquery =
          "SELECT a.id FROM assessments a WHERE a.section_id=ANY($1::bigint[])";
        await client.query(
          `DELETE FROM attendance_history WHERE attendance_id IN (SELECT a.id FROM attendance a JOIN class_sessions s ON s.id=a.session_id WHERE s.section_id=ANY($1::bigint[]))`,
          [sections],
        );
        await client.query(
          "DELETE FROM attendance WHERE session_id IN (SELECT id FROM class_sessions WHERE section_id=ANY($1::bigint[]))",
          [sections],
        );
        await client.query(
          "DELETE FROM rubric_scores WHERE submission_id IN (SELECT sub.id FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id JOIN assessments x ON x.id=a.assessment_id WHERE x.section_id=ANY($1::bigint[]))",
          [sections],
        );
        await client.query(
          `DELETE FROM submissions WHERE assignment_id IN (SELECT id FROM assignments WHERE assessment_id IN (${subquery}))`,
          [sections],
        );
        await client.query(
          `DELETE FROM rubrics WHERE assignment_id IN (SELECT id FROM assignments WHERE assessment_id IN (${subquery}))`,
          [sections],
        );
        await client.query(
          `DELETE FROM assignments WHERE assessment_id IN (${subquery})`,
          [sections],
        );
        await client.query(
          `DELETE FROM exams WHERE assessment_id IN (${subquery})`,
          [sections],
        );
        await client.query(
          `DELETE FROM grade_history WHERE assessment_id IN (${subquery})`,
          [sections],
        );
        await client.query(
          `DELETE FROM scores WHERE assessment_id IN (${subquery})`,
          [sections],
        );
        await client.query(
          "DELETE FROM assessments WHERE section_id=ANY($1::bigint[])",
          [sections],
        );
        for (const table of [
          "assessment_categories",
          "final_grades",
          "materials",
          "announcements",
          "class_sessions",
          "meetings",
          "schedule_exceptions",
          "enrollments",
        ])
          await client.query(
            `DELETE FROM ${table} WHERE section_id=ANY($1::bigint[])`,
            [sections],
          );
        await client.query("DELETE FROM sections WHERE id=ANY($1::bigint[])", [
          sections,
        ]);
        for (const [table, key] of [
          ["office_hours", "teacher_id"],
          ["teacher_departments", "teacher_id"],
          ["audit_logs", "actor_id"],
          ["import_jobs", "actor_id"],
          ["email_jobs", "user_id"],
          ["invitations", "invited_by"],
        ])
          await client.query(
            `DELETE FROM ${table} WHERE ${key}=ANY($1::bigint[])`,
            [ids],
          );
        await client.query(
          "DELETE FROM program_courses WHERE program_id IN (SELECT id FROM programs WHERE name LIKE $1)",
          [`${prefix}%`],
        );
        await client.query(
          "DELETE FROM users WHERE id=ANY($1::bigint[]) AND email=ANY($2::text[])",
          [ids, emails],
        );
        for (const [table, key] of [
          ["help_articles", "title"],
          ["courses", "name"],
          ["programs", "name"],
          ["terms", "name"],
          ["rooms", "name"],
          ["academic_years", "name"],
          ["departments", "name"],
        ])
          await client.query(`DELETE FROM ${table} WHERE ${key} LIKE $1`, [
            `${prefix}%`,
          ]);
        await client.query("COMMIT");
        console.log(
          "PASS all temporary live academic accounts, files and school records removed",
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error("Academic fixture cleanup needs attention:", error.message);
    process.exitCode = 1;
    await query(
      "UPDATE users SET status='inactive' WHERE email=ANY($1::text[])",
      [emails],
    ).catch(() => {});
  }
}
