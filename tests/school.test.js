import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import handler from "../server/handler.js";
import { query, getPool } from "../server/db.js";
import nodemailer from "nodemailer";
import { storage } from "../server/files.js";
import { zonedISO, zonedInput } from "../shared/time.js";
import { weightedGrade } from "../shared/grades.js";
const testUrl = process.env.TEST_DATABASE_URL,
  enabled = testUrl && new URL(testUrl).pathname.endsWith("_test");
const schema = `school_${randomBytes(5).toString("hex")}`;
let server, base;
const accounts = {};
before(async () => {
  if (!enabled) return;
  const url = new URL(testUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.APP_URL = "http://localhost:5173";
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
  for (const role of ["admin", "teacher", "student", "outsider"]) {
    const u = (
      await query(
        "INSERT INTO users(name,email,role,email_verified) VALUES($1,$2,$3,1) RETURNING id",
        [role, `${role}@example.test`, role === "outsider" ? "student" : role],
      )
    ).rows[0];
    const token = randomBytes(32).toString("hex");
    await query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
      [createHash("sha256").update(token).digest("hex"), u.id],
    );
    accounts[role] = { id: u.id, cookie: `school_session=${token}` };
  }
  server = createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (enabled) {
    await query(`DROP SCHEMA ${schema} CASCADE`);
    await getPool().end();
  }
});
async function api(role, resource, body) {
  const res = await fetch(
    `${base}/api/school${resource ? `?resource=${resource}` : ""}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(role ? { Cookie: accounts[role].cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  return { status: res.status, ...(await res.json()) };
}
async function create(role, resource, b) {
  const r = await api(role, resource, b);
  assert.equal(r.status, 200, `${resource}: ${r.message}`);
  return r.record;
}
test(
  "administrator to teacher to student academic lifecycle and authorization",
  { skip: !enabled },
  async (t) => {
    assert.equal((await api(null)).status, 401);
    assert.equal(
      (
        await api("student", "courses", {
          code: "NO",
          name: "Forbidden",
          credits: 3,
        })
      ).status,
      403,
    );
    const department = await create("admin", "departments", {
      name: "Computer Science",
    });
    const program = await create("admin", "programs", {
      name: "BSCS",
      department_id: department.id,
    });
    const term = await create("admin", "terms", {
      name: "Fall 2026",
      starts_on: "2026-01-01",
      ends_on: "2030-12-31",
    });
    const room = await create("admin", "rooms", {
      name: "Lab A",
      capacity: 30,
    });
    const course = await create("admin", "courses", {
      code: "CS101",
      name: "Databases",
      credits: 3,
      department_id: department.id,
    });
    const section = await create("admin", "sections", {
      course_id: course.id,
      teacher_id: accounts.teacher.id,
      term_id: term.id,
      name: "A",
      capacity: 1,
    });
    await create("admin", "people", {
      id: accounts.student.id,
      role: "student",
      status: "active",
      student_number: "SH001",
      program_id: program.id,
      year_level: 2,
    });
    await create("admin", "enrollments", {
      section_id: section.id,
      student_id: accounts.student.id,
      status: "active",
    });
    await t.test("capacity and duplicate enrollment safeguards", async () => {
      assert.equal(
        (
          await api("admin", "enrollments", {
            section_id: section.id,
            student_id: accounts.outsider.id,
          })
        ).status,
        409,
      );
      await create("admin", "enrollments", {
        section_id: section.id,
        student_id: accounts.student.id,
        status: "active",
      });
      assert.equal((await api("student")).enrollments.length, 1);
    });
    const meeting = await create("admin", "meetings", {
      section_id: section.id,
      room_id: room.id,
      weekday: 1,
      starts_at: "09:00",
      ends_at: "10:00",
    });
    assert.ok(meeting.id);
    await t.test(
      "room and teacher schedule collisions are rejected",
      async () => {
        assert.equal(
          (
            await api("admin", "meetings", {
              section_id: section.id,
              room_id: room.id,
              weekday: 1,
              starts_at: "09:30",
              ends_at: "10:30",
            })
          ).status,
          409,
        );
      },
    );
    const assignment = await create("teacher", "assignments", {
      section_id: section.id,
      title: "Schema project",
      points: 100,
      weight: 50,
      instructions: "Design tables.",
      due_at: "2030-01-01T12:00:00Z",
      published: false,
    });
    await t.test("drafts and other students are private", async () => {
      assert.equal((await api("student")).assignments.length, 0);
      assert.equal((await api("outsider")).sections.length, 0);
      assert.equal(
        (
          await api("outsider", "submissions", {
            assignment_id: assignment.id,
            content: "Stolen",
          })
        ).status,
        404,
      );
    });
    await create("teacher", "assignments", {
      ...assignment,
      section_id: section.id,
      title: "Schema project",
      points: 100,
      weight: 50,
      due_at: "2030-01-01T12:00:00Z",
      published: true,
    });
    const submission = await create("student", "submissions", {
      assignment_id: assignment.id,
      content: "Version one",
    });
    await create("student", "submissions", {
      assignment_id: assignment.id,
      content: "Version two",
    });
    const assessment = (await api("teacher")).assessments[0];
    await create("teacher", "scores", {
      assessment_id: assessment.id,
      student_id: accounts.student.id,
      points: 85,
      feedback: "Good work",
      published: false,
    });
    assert.equal((await api("student")).scores.length, 0);
    await create("teacher", "scores", {
      assessment_id: assessment.id,
      student_id: accounts.student.id,
      points: 90,
      feedback: "Released",
      published: true,
    });
    const exam = await create("teacher", "exams", {
      section_id: section.id,
      title: "Midterm",
      points: 100,
      weight: 50,
      starts_at: "2029-01-05T01:00:00Z",
      ends_at: "2029-01-05T03:00:00Z",
      room_id: room.id,
      published: true,
    });
    await create("teacher", "scores", {
      assessment_id: exam.assessment_id,
      student_id: accounts.student.id,
      points: 80,
      published: true,
    });
    const final = await create("teacher", "final_grades", {
      section_id: section.id,
      student_id: accounts.student.id,
      published: true,
    });
    assert.equal(Number(final.percentage), 85);
    assert.equal(final.letter, "B");
    const session = await create("teacher", "class_sessions", {
      section_id: section.id,
      held_on: "2026-10-23",
      title: "Lecture",
    });
    await create("teacher", "attendance", {
      session_id: session.id,
      student_id: accounts.student.id,
      status: "present",
    });
    await create("teacher", "attendance", {
      session_id: session.id,
      student_id: accounts.student.id,
      status: "late",
      note: "Corrected arrival",
    });
    const material = await create("teacher", "materials", {
      section_id: section.id,
      title: "Syllabus",
      content: "Course overview",
    });
    await create("student", "resource_completions", {
      material_id: material.id,
      completed: true,
    });
    const announcement = await create("teacher", "announcements", {
      section_id: section.id,
      title: "Welcome",
      content: "Hello class",
      pinned: true,
    });
    await create("student", "announcement_reads", { id: announcement.id });
    await t.test(
      "student results, feedback, notifications, and submission history are correct",
      async () => {
        const s = await api("student");
        assert.equal(s.scores.length, 2);
        assert.equal(s.final_grades[0].percentage, "85.00");
        assert.equal(s.attendance.length, 1);
        assert.equal(s.attendance[0].status, "late");
        assert.equal(s.submission_versions.length, 2);
        assert.equal(s.submissions[0].content, "Version two");
        assert.equal(s.submissions[0].id, submission.id);
        assert.ok(s.announcements[0].read_at);
        assert.ok(s.notifications.length);
        assert.equal(s.resource_completions.length, 1);
        assert.equal(s.people.length, 0);
        assert.equal(s.audit_logs, undefined);
        const o = await api("outsider");
        for (const table of [
          "scores",
          "submissions",
          "attendance",
          "announcements",
          "materials",
          "final_grades",
        ])
          assert.equal(o[table].length, 0, table);
      },
    );
    await t.test(
      "private file upload, download, ownership, deletion and storage errors",
      async () => {
        const blobs = new Map();
        const beforeToken = process.env.BLOB_READ_WRITE_TOKEN;
        process.env.BLOB_READ_WRITE_TOKEN = "test-token";
        const mocks = [
          mock.method(storage, "put", async (path, bytes) => {
            blobs.set(path, bytes);
            return { pathname: path };
          }),
          mock.method(storage, "get", async (path) => ({
            statusCode: 200,
            stream: new ReadableStream({
              start(c) {
                c.enqueue(blobs.get(path));
                c.close();
              },
            }),
          })),
          mock.method(storage, "del", async (path) => blobs.delete(path)),
        ];
        const fileApi = async (role, method, body, fileId) =>
          fetch(`${base}/api/file${fileId ? `?id=${fileId}` : ""}`, {
            method,
            headers: {
              "Content-Type": "application/json",
              Cookie: accounts[role].cookie,
            },
            body: body ? JSON.stringify(body) : undefined,
          });
        try {
          const upload = await fileApi("student", "POST", {
            purpose: "submission",
            submission_id: submission.id,
            name: "answer.txt",
            content_type: "text/plain",
            base64: Buffer.from("Private answer").toString("base64"),
          });
          assert.equal(upload.status, 200, await upload.clone().text());
          const file = (await upload.json()).file;
          assert.equal(
            await (await fileApi("student", "GET", null, file.id)).text(),
            "Private answer",
          );
          assert.equal(
            (await fileApi("teacher", "GET", null, file.id)).status,
            200,
          );
          assert.equal(
            (await fileApi("outsider", "GET", null, file.id)).status,
            404,
          );
          assert.equal(
            (await fileApi("outsider", "DELETE", null, file.id)).status,
            404,
          );
          assert.equal(
            (
              await fileApi("student", "POST", {
                purpose: "document",
                name: "bad.png",
                content_type: "image/png",
                base64: Buffer.from("not an image").toString("base64"),
              })
            ).status,
            400,
          );
          assert.equal(
            (await fileApi("student", "DELETE", null, file.id)).status,
            200,
          );
          assert.equal(blobs.size, 0);
          delete process.env.BLOB_READ_WRITE_TOKEN;
          assert.equal(
            (await fileApi("student", "POST", { purpose: "document" })).status,
            503,
          );
        } finally {
          mocks.forEach((m) => m.mock.restore());
          if (beforeToken === undefined)
            delete process.env.BLOB_READ_WRITE_TOKEN;
          else process.env.BLOB_READ_WRITE_TOKEN = beforeToken;
        }
      },
    );
    await t.test(
      "rubrics, academic setup, CSV import validation, and calendar exceptions",
      async () => {
        const criterion = await create("teacher", "rubrics", {
          assignment_id: assignment.id,
          title: "Correctness",
          maximum: 100,
        });
        assert.equal(
          (
            await api("teacher", "rubric_scores", {
              submission_id: submission.id,
              criteria: [],
            })
          ).status,
          400,
        );
        await create("teacher", "rubric_scores", {
          submission_id: submission.id,
          criteria: [{ id: criterion.id, points: 90 }],
          published: true,
        });
        const hours = await create("teacher", "office_hours", {
          weekday: 2,
          starts_at: "13:00",
          ends_at: "14:00",
          location: "Lab A",
        });
        assert.ok(hours.id);
        await create("admin", "program_courses", {
          program_id: program.id,
          course_id: course.id,
          year_level: 2,
        });
        await create("admin", "teacher_departments", {
          teacher_id: accounts.teacher.id,
          department_id: department.id,
        });
        const event = await create("admin", "schedule_exceptions", {
          kind: "holiday",
          title: "School holiday",
          starts_at: "2027-01-01T00:00:00Z",
          ends_at: "2027-01-02T00:00:00Z",
        });
        assert.ok(event.id);
        assert.equal(
          (
            await api("student", "schedule_exceptions", {
              kind: "holiday",
              title: "Fake",
              starts_at: "2027-01-01",
              ends_at: "2027-01-02",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await api("admin", "import_people", {
              rows: [{ email: "missing@example.test", name: "Missing" }],
            })
          ).status,
          400,
        );
        await create("admin", "import_people", {
          rows: [
            {
              email: "outsider@example.test",
              name: "Imported outsider",
              role: "student",
            },
          ],
        });
        assert.equal((await api("outsider")).user.name, "Imported outsider");
        assert.equal(
          (
            await api("admin", "catalog_delete", {
              table: "courses",
              id: course.id,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "announcement targeting and scheduling do not leak to the wrong audience",
      async () => {
        await create("admin", "announcements", {
          title: "Faculty only",
          content: "Teacher audience",
          audience_role: "teacher",
        });
        await create("admin", "announcements", {
          title: "Future announcement",
          content: "Hidden until publication",
          publish_at: "2030-01-01T00:00:00Z",
        });
        assert.equal(
          (await api("student")).announcements.some(
            (a) =>
              a.title === "Faculty only" || a.title === "Future announcement",
          ),
          false,
        );
        assert.equal(
          (await api("teacher")).announcements.some(
            (a) => a.title === "Faculty only",
          ),
          true,
        );
      },
    );
    await t.test(
      "invitation email, verified acceptance and background delivery use server-side permissions",
      async () => {
        const names = [
          "MAIL_PROVIDER",
          "GMAIL_USER",
          "GMAIL_APP_PASSWORD",
          "CRON_SECRET",
        ];
        const previous = Object.fromEntries(
          names.map((k) => [k, process.env[k]]),
        );
        Object.assign(process.env, {
          MAIL_PROVIDER: "gmail",
          GMAIL_USER: "sender@example.test",
          GMAIL_APP_PASSWORD: "abcdefghijklmnop",
          CRON_SECRET: "test-cron-only",
        });
        const delivered = [];
        let failDelivery = false;
        const smtp = mock.method(nodemailer, "createTransport", () => ({
          async sendMail(message) {
            if (failDelivery) throw new Error("Simulated SMTP failure");
            delivered.push(message);
            return { accepted: [message.to] };
          },
        }));
        try {
          await create("admin", "invitations", {
            email: "outsider@example.test",
            name: "Invited Student",
            role: "student",
          });
          assert.match(delivered[0].text, /Hello Invited Student/);
          assert.match(delivered[0].text, /invited as a student/);
          const token = delivered[0].text.match(/invite=([a-f0-9]{64})/)[1];
          assert.equal(
            (await api("student", "accept_invitation", { token })).status,
            400,
          );
          await create("outsider", "accept_invitation", { token });
          assert.equal(
            (await api("outsider", "accept_invitation", { token })).status,
            400,
          );
          assert.equal((await fetch(`${base}/api/jobs`)).status, 401);
          assert.equal(
            (
              await fetch(`${base}/api/jobs`, {
                method: "POST",
                headers: { Cookie: accounts.student.cookie },
              })
            ).status,
            403,
          );
          const response = await fetch(`${base}/api/jobs`, {
            method: "POST",
            headers: { Cookie: accounts.admin.cookie },
          });
          assert.equal(response.status, 200, await response.clone().text());
          const result = await response.json();
          assert.ok(result.sent > 0);
          assert.equal(result.failed, 0);
          assert.ok(delivered.length > 1);
          const job = (
            await query(
              "INSERT INTO email_jobs(user_id,subject,content,dedupe_key) VALUES($1,'Retry check','Test only','retry-check') RETURNING id",
              [accounts.student.id],
            )
          ).rows[0];
          failDelivery = true;
          const failed = await fetch(`${base}/api/jobs`, {
            method: "POST",
            headers: { Cookie: accounts.admin.cookie },
          });
          assert.equal((await failed.json()).failed, 1);
          assert.equal(
            (await query("SELECT state FROM email_jobs WHERE id=$1", [job.id]))
              .rows[0].state,
            "failed",
          );
          assert.equal(
            (await api("student", "retry_email", { id: job.id })).status,
            403,
          );
          await create("admin", "retry_email", { id: job.id });
          failDelivery = false;
          const retry = await fetch(`${base}/api/jobs`, {
            method: "POST",
            headers: { Cookie: accounts.admin.cookie },
          });
          assert.equal((await retry.json()).sent, 1);
          assert.equal(
            (await query("SELECT state FROM email_jobs WHERE id=$1", [job.id]))
              .rows[0].state,
            "sent",
          );
        } finally {
          smtp.mock.restore();
          for (const key of names) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
          }
        }
      },
    );
    await t.test("scope tampering and over-maximum scores fail", async () => {
      assert.equal(
        (
          await api("student", "scores", {
            assessment_id: assessment.id,
            student_id: accounts.student.id,
            points: 100,
            published: true,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api("teacher", "scores", {
            assessment_id: assessment.id,
            student_id: accounts.student.id,
            points: 101,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await api("teacher", "attendance", {
            session_id: session.id,
            student_id: accounts.outsider.id,
            status: "present",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await api("teacher", "announcements", {
            title: "Global",
            content: "Not allowed",
          })
        ).status,
        403,
      );
    });
    await t.test(
      "grade edits unpublish finalized results and retain history",
      async () => {
        await create("teacher", "scores", {
          assessment_id: assessment.id,
          student_id: accounts.student.id,
          points: 95,
          published: true,
          reason: "Recheck",
        });
        assert.equal((await api("student")).final_grades.length, 0);
        assert.ok((await api("teacher")).grade_history.length >= 4);
      },
    );
    await t.test(
      "exam and rescheduled-class conflicts include regular timetables and room capacity",
      async () => {
        const second = await create("admin", "sections", {
          course_id: course.id,
          term_id: term.id,
          teacher_id: accounts.teacher.id,
          name: "B",
          capacity: 1,
        });
        assert.equal(
          (
            await api("teacher", "exams", {
              section_id: second.id,
              title: "Conflicting exam",
              points: 100,
              weight: 100,
              starts_at: "2029-01-08T01:00:00Z",
              ends_at: "2029-01-08T02:00:00Z",
              room_id: room.id,
              published: true,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await api("teacher", "schedule_exceptions", {
              section_id: section.id,
              kind: "rescheduled",
              title: "Clash with exam",
              starts_at: "2029-01-05T01:00:00Z",
              ends_at: "2029-01-05T02:00:00Z",
              room_id: room.id,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await api("admin", "section_update", {
              id: section.id,
              teacher_id: accounts.teacher.id,
              name: "A",
              capacity: 31,
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "closed deadlines and archived sections reject changes",
      async () => {
        await create("teacher", "assignments", {
          ...assignment,
          section_id: section.id,
          title: "Schema project",
          points: 100,
          weight: 50,
          due_at: "2020-01-01T12:00:00Z",
          published: true,
        });
        assert.equal(
          (
            await api("student", "submissions", {
              assignment_id: assignment.id,
              content: "Too late",
            })
          ).status,
          409,
        );
        await create("admin", "sections", { id: section.id, archived: true });
        assert.equal(
          (
            await api("teacher", "materials", {
              section_id: section.id,
              title: "New",
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "profile/preferences and disabled-account protection",
      async () => {
        await create("student", "profile", {
          name: "Student Name",
          phone: "123",
          emergency_name: "Parent",
        });
        await create("student", "preferences", {
          timezone: "Asia/Manila",
          theme: "dark",
          notify_grades: true,
        });
        assert.equal((await api("student")).profile[0].theme, "dark");
        await create("admin", "people", {
          id: accounts.outsider.id,
          role: "student",
          status: "inactive",
        });
        assert.equal((await api("outsider")).status, 401);
      },
    );
  },
);
test("weighted grades handle category weights, exemptions and incomplete work", () => {
  const a = [
      { id: 1, points: 100, weight: 100, category_id: 1, published: true },
      { id: 2, points: 50, weight: 100, category_id: 2, published: true },
    ],
    c = [
      { id: 1, weight: 40 },
      { id: 2, weight: 60 },
    ];
  assert.equal(
    weightedGrade(
      a,
      [
        { assessment_id: 1, points: 80 },
        { assessment_id: 2, points: 50 },
      ],
      c,
      { complete: true },
    ),
    92,
  );
  assert.throws(
    () => weightedGrade(a, [], c, { complete: true }),
    /needs a score/,
  );
  assert.equal(
    weightedGrade(a, [], c, { complete: true, missingAsZero: true }),
    0,
  );
});

test("timezone conversion preserves the configured school timezone and rejects DST gaps", () => {
  assert.equal(
    zonedISO("2026-10-23T09:00", "Asia/Manila"),
    "2026-10-23T01:00:00.000Z",
  );
  assert.equal(
    zonedInput("2026-10-23T01:00:00Z", "Asia/Manila"),
    "2026-10-23T09:00",
  );
  assert.throws(
    () => zonedISO("2026-03-08T02:30", "America/New_York"),
    /does not exist/,
  );
});

test(
  "school policies, late penalties, exemptions, missing work, atomic imports and request validation",
  { skip: !enabled },
  async () => {
    const previous = (await api("admin")).school_settings;
    const schoolPolicy = previous.find((p) => p.key === "school").value;
    const gradePolicy = previous.find((p) => p.key === "grading").value;
    try {
      await create("admin", "school_settings", {
        name: "QA School",
        timezone: "Asia/Manila",
        attendance_threshold: 80,
      });
      assert.equal(
        (
          await api("student", "school_settings", {
            name: "Forbidden",
            timezone: "UTC",
            attendance_threshold: 0,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await api("admin", "school_settings", {
            name: "Bad zone",
            timezone: "Not/AZone",
            attendance_threshold: 80,
          })
        ).status,
        400,
      );
      await create("admin", "grading_policy", {
        ...gradePolicy,
        late_penalty_percent: 10,
        missing_as_zero: true,
        late_counts_present: false,
        exclude_excused: false,
      });
      const course = (await query("SELECT id FROM courses ORDER BY id LIMIT 1"))
        .rows[0];
      const term = (await query("SELECT id FROM terms ORDER BY id LIMIT 1"))
        .rows[0];
      const section = await create("admin", "sections", {
        course_id: course.id,
        term_id: term.id,
        teacher_id: accounts.teacher.id,
        name: "Extended QA",
        capacity: 3,
      });
      await create("admin", "enrollments", {
        section_id: section.id,
        student_id: accounts.student.id,
        status: "active",
      });
      const assignmentBody = {
        section_id: section.id,
        title: "Late assignment",
        points: 100,
        weight: 100,
        instructions: "Test",
        due_at: "2020-01-01T00:00:00Z",
        allow_late: true,
        published: true,
      };
      const assignment = await create("teacher", "assignments", assignmentBody);
      const submission = await create("student", "submissions", {
        assignment_id: assignment.id,
        content: "Late work",
      });
      const scoreBody = {
        assessment_id: assignment.assessment_id,
        student_id: accounts.student.id,
        points: 90,
        published: true,
      };
      let score = await create("teacher", "scores", scoreBody);
      assert.equal(Number(score.points), 80);
      assert.equal(Number(score.raw_points), 90);
      assert.equal(Number(score.late_penalty), 10);
      await create("teacher", "scores", { ...scoreBody, exempt: true });
      assert.equal(
        (
          await api("teacher", "final_grades", {
            section_id: section.id,
            student_id: accounts.student.id,
            published: true,
          })
        ).status,
        400,
      );
      await create("teacher", "scores", { ...scoreBody, exempt: false });
      const criterion = await create("teacher", "rubrics", {
        assignment_id: assignment.id,
        title: "Correctness",
        maximum: 100,
      });
      score = await create("teacher", "rubric_scores", {
        submission_id: submission.id,
        criteria: [{ id: criterion.id, points: 90 }],
        published: true,
      });
      assert.equal(Number(score.points), 80);
      await create("teacher", "assignments", {
        ...assignmentBody,
        id: assignment.id,
        weight: 50,
      });
      const missing = await create("teacher", "assessments", {
        section_id: section.id,
        title: "Missing work",
        points: 100,
        weight: 50,
        published: true,
      });
      const final = await create("teacher", "final_grades", {
        section_id: section.id,
        student_id: accounts.student.id,
        published: true,
      });
      assert.equal(Number(final.percentage), 40);
      await create("teacher", "assessment_archive", {
        id: missing.id,
        archived: true,
      });
      assert.equal(
        (
          await api("teacher", "final_grades", {
            section_id: section.id,
            student_id: accounts.student.id,
          })
        ).status,
        400,
      );
      await create("teacher", "assignments", {
        ...assignmentBody,
        id: assignment.id,
        weight: 100,
      });
      assert.equal(
        Number(
          (
            await create("teacher", "final_grades", {
              section_id: section.id,
              student_id: accounts.student.id,
              published: true,
            })
          ).percentage,
        ),
        80,
      );
      assert.equal(
        (
          await api("teacher", "assessment_archive", {
            id: missing.id,
            archived: false,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await api("teacher", "assignments", {
            ...assignmentBody,
            id: assignment.id,
            points: 80,
          })
        ).status,
        400,
      );
      const name = (
        await query("SELECT name FROM users WHERE id=$1", [accounts.student.id])
      ).rows[0].name;
      assert.equal(
        (
          await api("admin", "import_people", {
            rows: [
              {
                email: "student@example.test",
                name: "Must roll back",
                role: "student",
              },
              {
                email: "missing-second@example.test",
                name: "Missing account",
                role: "student",
              },
            ],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await query("SELECT name FROM users WHERE id=$1", [
            accounts.student.id,
          ])
        ).rows[0].name,
        name,
      );
      const oldNumber = (await api("student")).profile[0].student_number;
      await create("student", "profile", {
        name,
        role: "admin",
        student_number: "FORGED",
        year_level: 8,
      });
      const protectedState = await api("student");
      assert.equal(protectedState.user.role, "student");
      assert.equal(protectedState.profile[0].student_number, oldNumber);
      const crossOrigin = await fetch(`${base}/api/school?resource=profile`, {
        method: "POST",
        headers: {
          Cookie: accounts.student.cookie,
          Origin: "https://attacker.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Forbidden" }),
      });
      assert.equal(crossOrigin.status, 403);
      const malformed = await fetch(`${base}/api/school`, {
        method: "POST",
        headers: {
          Cookie: accounts.student.cookie,
          "Content-Type": "application/json",
        },
        body: "{broken",
      });
      assert.equal(malformed.status, 400);
      const large = await fetch(`${base}/api/school`, {
        method: "POST",
        headers: {
          Cookie: accounts.student.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: "x".repeat(132000) }),
      });
      assert.equal(large.status, 413);
      const state = await api("student");
      assert.ok(state.sessions.length);
      await create("student", "sessions", { id: state.sessions[0].id });
      assert.equal((await api("student")).status, 401);
    } finally {
      await create("admin", "school_settings", schoolPolicy);
      await create("admin", "grading_policy", {
        ...gradePolicy,
        late_penalty_percent: gradePolicy.late_penalty_percent || 0,
      });
    }
  },
);
