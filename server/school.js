import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { requireMailConfig } from "./mail.js";
import { eventSlot } from "./scheduling.js";
import { learningResources, readLearning, mutateLearning } from "./learning.js";
import { getPool } from "./db.js";

export const schoolError = (status, message) =>
  Object.assign(new Error(message), { status });
export const text = (value, max = 200, required = true) => {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw schoolError(400, "Check the required text fields.");
  return value.trim();
};
export const number = (value, min = 1, max = Number.MAX_SAFE_INTEGER) => {
  if (!["string", "number"].includes(typeof value))
    throw schoolError(400, "Enter a numeric value.");
  const result = Number(value);
  if (
    value === "" ||
    value == null ||
    !Number.isFinite(result) ||
    result < min ||
    result > max
  )
    throw schoolError(400, "A numeric field is outside its allowed range.");
  return result;
};
export const id = (value) => {
  const n = number(value);
  if (!Number.isSafeInteger(n)) throw schoolError(400, "Invalid record ID.");
  return n;
};
export const date = (value) => {
  if (!value || !Number.isFinite(Date.parse(value)))
    throw schoolError(400, "Enter a valid date.");
  return value;
};
export const choice = (value, allowed) => {
  if (!allowed.includes(value)) throw schoolError(400, "Invalid selection.");
  return value;
};
export const boolean = (value) => value === true;
export const admin = (user) => {
  if (user.role !== "admin")
    throw schoolError(403, "Administrator access is required.");
};
export const staff = (user) => {
  if (!["admin", "teacher"].includes(user.role))
    throw schoolError(403, "Teacher access is required.");
};
export async function authenticated(req, client) {
  const token = /(?:^|;\s*)school_session=([a-f0-9]{64})(?:;|$)/.exec(
    req.headers.cookie || "",
  )?.[1];
  if (!token) throw schoolError(401, "Please sign in.");
  const { rows } = await client.query(
    "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [createHash("sha256").update(token).digest("hex")],
  );
  if (!rows[0]) throw schoolError(401, "Please sign in.");
  if (rows[0].status !== "active")
    throw schoolError(
      403,
      "This account is inactive. Contact your administrator.",
    );
  return rows[0];
}
export async function sectionAccess(client, user, sectionId, write = false) {
  const { rows } = await client.query(
    `SELECT s.* FROM sections s WHERE s.id=$1 AND ($2='admin' OR s.teacher_id=$3 OR ($2='student' AND NOT $4 AND EXISTS(SELECT 1 FROM enrollments e WHERE e.section_id=s.id AND e.student_id=$3 AND e.status='active'))) ${write ? "FOR UPDATE" : ""}`,
    [id(sectionId), user.role, user.id, write],
  );
  if (!rows[0]) throw schoolError(403, "You do not have access to this class.");
  if (write && rows[0].archived)
    throw schoolError(409, "This class is archived.");
  return rows[0];
}
export async function enrolled(client, sectionId, studentId) {
  const { rowCount } = await client.query(
    "SELECT 1 FROM enrollments e JOIN users u ON u.id=e.student_id WHERE e.section_id=$1 AND e.student_id=$2 AND e.status='active' AND u.role='student' AND u.status='active'",
    [id(sectionId), id(studentId)],
  );
  if (!rowCount)
    throw schoolError(400, "Select an active student enrolled in this class.");
}
async function notify(client, sectionId, title, href, preference) {
  const field = {
    assignments: "notify_assignments",
    announcements: "notify_announcements",
    grades: "notify_grades",
  }[preference];
  await client.query(
    `INSERT INTO notifications(user_id,title,href) SELECT e.student_id,$2,$3 FROM enrollments e LEFT JOIN profiles p ON p.user_id=e.student_id WHERE e.section_id=$1 AND e.status='active' ${field ? `AND coalesce(p.${field},true)` : ""}`,
    [sectionId, title, href],
  );
}
async function readSchool(client, user) {
  const result = {};
  const run = async (key, sql, args = []) => {
    result[key] = (await client.query(sql, args)).rows;
  };
  const scope =
    "($1='admin' OR s.teacher_id=$2 OR EXISTS(SELECT 1 FROM enrollments e WHERE e.section_id=s.id AND e.student_id=$2 ))";
  const args = [user.role, user.id];
  result.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    auth_provider: user.auth_provider,
    google_linked: !!user.google_id,
  };
  await run("profile", "SELECT * FROM profiles WHERE user_id=$1", [user.id]);
  for (const table of [
    "departments",
    "programs",
    "terms",
    "rooms",
    "school_settings",
  ])
    await run(
      table,
      `SELECT * FROM ${table} ORDER BY ${table === "school_settings" ? "key" : "id"} DESC`,
    );
  await run(
    "courses",
    user.role === "admin"
      ? "SELECT * FROM courses ORDER BY code"
      : `SELECT DISTINCT c.* FROM courses c JOIN sections s ON s.course_id=c.id WHERE ${scope} ORDER BY c.code`,
    user.role === "admin" ? [] : args,
  );
  await run(
    "sections",
    `SELECT s.*,c.code,c.name AS course_name,c.credits,t.name AS term_name,u.name AS teacher_name,(SELECT count(*)::int FROM enrollments e WHERE e.section_id=s.id AND e.status='active') AS enrolled FROM sections s JOIN courses c ON c.id=s.course_id JOIN terms t ON t.id=s.term_id JOIN users u ON u.id=s.teacher_id WHERE ${scope} ORDER BY s.id DESC`,
    args,
  );
  await run(
    "enrollments",
    `SELECT e.*,u.name AS student_name FROM enrollments e JOIN sections s ON s.id=e.section_id JOIN users u ON u.id=e.student_id WHERE ${scope} AND ($1<>'student' OR e.student_id=$2) ORDER BY e.id`,
    args,
  );
  await run(
    "meetings",
    `SELECT m.*,r.name AS room_name FROM meetings m JOIN sections s ON s.id=m.section_id JOIN rooms r ON r.id=m.room_id WHERE ${scope} ORDER BY m.weekday,m.starts_at`,
    args,
  );
  await run(
    "class_sessions",
    `SELECT cs.* FROM class_sessions cs JOIN sections s ON s.id=cs.section_id WHERE ${scope} ORDER BY cs.held_on DESC`,
    args,
  );
  await run(
    "attendance",
    `SELECT a.*,cs.section_id,cs.held_on,cs.title,u.name AS student_name FROM attendance a JOIN class_sessions cs ON cs.id=a.session_id JOIN sections s ON s.id=cs.section_id JOIN users u ON u.id=a.student_id WHERE ${scope} AND ($1<>'student' OR a.student_id=$2) ORDER BY cs.held_on DESC`,
    args,
  );
  await run(
    "assessments",
    `SELECT a.* FROM assessments a JOIN sections s ON s.id=a.section_id WHERE ${scope} AND ($1<>'student' OR a.published AND NOT a.archived) ORDER BY a.id DESC`,
    args,
  );
  await run(
    "assignments",
    `SELECT a.*,x.section_id,x.title,x.points,x.weight,x.published,x.archived FROM assignments a JOIN assessments x ON x.id=a.assessment_id JOIN sections s ON s.id=x.section_id WHERE ${scope} AND ($1<>'student' OR x.published AND NOT x.archived) ORDER BY a.due_at`,
    args,
  );
  await run(
    "submissions",
    `SELECT sub.*,x.section_id,x.title,u.name AS student_name FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id JOIN assessments x ON x.id=a.assessment_id JOIN sections s ON s.id=x.section_id JOIN users u ON u.id=sub.student_id WHERE ${scope} AND ($1<>'student' OR sub.student_id=$2) ORDER BY sub.submitted_at DESC`,
    args,
  );
  await run(
    "submission_versions",
    `SELECT v.* FROM submission_versions v JOIN submissions sub ON sub.id=v.submission_id JOIN assignments a ON a.id=sub.assignment_id JOIN assessments x ON x.id=a.assessment_id JOIN sections s ON s.id=x.section_id WHERE ${scope} AND ($1<>'student' OR sub.student_id=$2) ORDER BY v.submitted_at DESC`,
    args,
  );
  await run(
    "scores",
    `SELECT g.*,x.section_id,x.title,x.points AS maximum,x.weight,u.name AS student_name FROM scores g JOIN assessments x ON x.id=g.assessment_id JOIN sections s ON s.id=x.section_id JOIN users u ON u.id=g.student_id WHERE ${scope} AND ($1<>'student' OR (g.student_id=$2 AND g.published AND x.published)) ORDER BY g.id DESC`,
    args,
  );
  await run(
    "exams",
    `SELECT e.*,x.section_id,x.title,x.points,x.weight,x.published,x.archived,r.name AS room_name FROM exams e JOIN assessments x ON x.id=e.assessment_id JOIN sections s ON s.id=x.section_id JOIN rooms r ON r.id=e.room_id WHERE ${scope} AND ($1<>'student' OR x.published AND NOT x.archived) ORDER BY e.starts_at`,
    args,
  );
  await run(
    "materials",
    `SELECT m.* FROM materials m JOIN sections s ON s.id=m.section_id WHERE ${scope} ORDER BY m.id DESC`,
    args,
  );
  await run(
    "announcements",
    `SELECT a.*,u.name AS author_name,ar.read_at FROM announcements a JOIN users u ON u.id=a.author_id LEFT JOIN sections s ON s.id=a.section_id LEFT JOIN announcement_reads ar ON ar.announcement_id=a.id AND ar.user_id=$2 WHERE (a.section_id IS NULL OR ${scope}) AND ($1='admin' OR a.author_id=$2 OR ((a.audience_role IS NULL OR a.audience_role=$1) AND (a.program_id IS NULL OR a.program_id=(SELECT program_id FROM profiles WHERE user_id=$2)) AND a.publish_at<=now() AND (a.expires_at IS NULL OR a.expires_at>now()))) ORDER BY a.pinned DESC,a.publish_at DESC`,
    args,
  );
  await run(
    "notifications",
    "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
    [user.id],
  );
  await run(
    "sessions",
    "SELECT token_hash AS id,expires_at FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY expires_at DESC",
    [user.id],
  );
  if (user.role === "admin") {
    let emailConfigured = false;
    try {
      requireMailConfig();
      emailConfigured = true;
    } catch {
      /* Readiness reports configuration presence, never secret values. */
    }
    result.services = {
      database: true,
      blobConfigured: !!process.env.BLOB_READ_WRITE_TOKEN,
      emailConfigured,
      cronConfigured: !!process.env.CRON_SECRET,
    };
  }
  if (user.role === "admin") {
    await run(
      "people",
      `SELECT u.id,u.name,u.email,u.role,u.status,u.email_verified,p.student_number,p.program_id,p.year_level FROM users u LEFT JOIN profiles p ON p.user_id=u.id ORDER BY u.name`,
    );
    await run(
      "audit_logs",
      "SELECT a.*,u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100",
    );
  } else if (user.role === "teacher") {
    await run(
      "people",
      `SELECT DISTINCT u.id,u.name,u.role FROM users u JOIN enrollments e ON e.student_id=u.id JOIN sections s ON s.id=e.section_id WHERE s.teacher_id=$1 AND e.status='active' ORDER BY u.name`,
      [user.id],
    );
  } else result.people = [];
  Object.assign(result, await readLearning(client, user));
  return result;
}

async function mutate(client, user, resource, b) {
  if (learningResources.includes(resource))
    return mutateLearning(client, user, resource, b);
  let row;
  const q = async (sql, values) => {
    row = (await client.query(sql, values)).rows[0];
    return row;
  };
  if (
    [
      "departments",
      "programs",
      "terms",
      "rooms",
      "courses",
      "sections",
      "enrollments",
      "people",
      "school_settings",
    ].includes(resource)
  )
    admin(user);
  switch (resource) {
    case "departments":
      await q("INSERT INTO departments(name) VALUES($1) RETURNING *", [
        text(b.name),
      ]);
      break;
    case "programs":
      await q(
        "INSERT INTO programs(name,department_id) VALUES($1,$2) RETURNING *",
        [text(b.name), b.department_id ? id(b.department_id) : null],
      );
      break;
    case "terms":
      await q(
        "INSERT INTO terms(name,starts_on,ends_on,academic_year_id) VALUES($1,$2,$3,$4) RETURNING *",
        [
          text(b.name),
          date(b.starts_on),
          date(b.ends_on),
          b.academic_year_id ? id(b.academic_year_id) : null,
        ],
      );
      break;
    case "rooms":
      await q("INSERT INTO rooms(name,capacity) VALUES($1,$2) RETURNING *", [
        text(b.name),
        id(b.capacity),
      ]);
      break;
    case "courses":
      await q(
        "INSERT INTO courses(code,name,credits,description,department_id) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          text(b.code, 30),
          text(b.name),
          number(b.credits, 0.1, 30),
          text(b.description || "", 12000, false),
          b.department_id ? id(b.department_id) : null,
        ],
      );
      break;
    case "sections": {
      await client.query("SELECT pg_advisory_xact_lock(724612)");
      if (b.id) {
        await q("UPDATE sections SET archived=$2 WHERE id=$1 RETURNING *", [
          id(b.id),
          boolean(b.archived),
        ]);
        break;
      }
      const teacher = (
        await client.query(
          "SELECT id FROM users WHERE id=$1 AND role='teacher' AND status='active'",
          [id(b.teacher_id)],
        )
      ).rows[0];
      if (!teacher) throw schoolError(400, "Select an active teacher.");
      await q(
        "INSERT INTO sections(course_id,term_id,teacher_id,name,capacity) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          id(b.course_id),
          id(b.term_id),
          teacher.id,
          text(b.name, 100),
          number(b.capacity, 1, 10000),
        ],
      );
      break;
    }
    case "people": {
      if (
        String(b.id) === String(user.id) &&
        (b.role !== "admin" || b.status !== "active")
      )
        throw schoolError(
          400,
          "You cannot remove your own administrator access.",
        );
      await client.query("SELECT pg_advisory_xact_lock(724612)");
      const owned = await client.query(
        "SELECT 1 FROM sections WHERE teacher_id=$1 AND NOT archived",
        [id(b.id)],
      );
      if (owned.rowCount && (b.role !== "teacher" || b.status !== "active"))
        throw schoolError(
          409,
          "Archive or reassign this teacher’s active classes first.",
        );
      await q(
        "UPDATE users SET role=$2,status=$3 WHERE id=$1 RETURNING id,name,email,role,status",
        [
          id(b.id),
          choice(b.role, ["student", "teacher", "admin"]),
          choice(b.status, ["active", "inactive"]),
        ],
      );
      if (!row) throw schoolError(404, "Account not found.");
      await client.query(
        "INSERT INTO profiles(user_id,student_number,program_id,year_level) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET student_number=$2,program_id=$3,year_level=$4",
        [
          row.id,
          b.student_number ? text(b.student_number, 50) : null,
          b.program_id ? id(b.program_id) : null,
          b.year_level ? number(b.year_level, 1, 8) : null,
        ],
      );
      if (b.status === "inactive")
        await client.query("DELETE FROM sessions WHERE user_id=$1", [row.id]);
      break;
    }
    case "enrollments": {
      await client.query("SELECT pg_advisory_xact_lock(724613)");
      const section = await sectionAccess(client, user, b.section_id, true);
      const student = (
        await client.query(
          "SELECT id FROM users WHERE id=$1 AND role='student' AND status='active'",
          [id(b.student_id)],
        )
      ).rows[0];
      if (!student) throw schoolError(400, "Select an active student.");
      const state = choice(b.status || "active", ["active", "withdrawn"]);
      const existing = (
        await client.query(
          "SELECT status FROM enrollments WHERE section_id=$1 AND student_id=$2",
          [section.id, student.id],
        )
      ).rows[0];
      const count = Number(
        (
          await client.query(
            "SELECT count(*) FROM enrollments WHERE section_id=$1 AND status='active'",
            [section.id],
          )
        ).rows[0].count,
      );
      if (
        state === "active" &&
        existing?.status !== "active" &&
        count >= section.capacity
      )
        throw schoolError(409, "This class is full.");
      if (state === "active") {
        const conflicts = await client.query(
          `SELECT 1 FROM meetings a JOIN meetings z ON a.weekday=z.weekday AND a.starts_at<z.ends_at AND a.ends_at>z.starts_at JOIN sections sa ON sa.id=a.section_id JOIN sections sz ON sz.id=z.section_id JOIN terms ta ON ta.id=sa.term_id JOIN terms tz ON tz.id=sz.term_id JOIN enrollments e ON e.section_id=z.section_id WHERE a.section_id=$1 AND z.section_id<>$1 AND e.student_id=$2 AND e.status='active' AND ta.starts_on<=tz.ends_on AND tz.starts_on<=ta.ends_on`,
          [section.id, student.id],
        );
        if (conflicts.rowCount)
          throw schoolError(
            409,
            "Enrollment conflicts with the student’s timetable.",
          );
      }
      await q(
        "INSERT INTO enrollments(section_id,student_id,status) VALUES($1,$2,$3) ON CONFLICT(section_id,student_id) DO UPDATE SET status=$3 RETURNING *",
        [section.id, student.id, state],
      );
      break;
    }
    case "meetings": {
      admin(user);
      await client.query("SELECT pg_advisory_xact_lock(724613)");
      const s = await sectionAccess(client, user, b.section_id, true);
      const weekday = number(b.weekday, 1, 7),
        start = text(b.starts_at, 8),
        end = text(b.ends_at, 8),
        room = id(b.room_id);
      if (
        !/^\d{2}:\d{2}(:\d{2})?$/.test(start) ||
        !/^\d{2}:\d{2}(:\d{2})?$/.test(end) ||
        start >= end
      )
        throw schoolError(400, "Enter a valid start and end time.");
      const conflict = await client.query(
        `SELECT 1 FROM meetings m JOIN sections s ON s.id=m.section_id JOIN terms t ON t.id=s.term_id JOIN terms proposed ON proposed.id=$6 WHERE NOT s.archived AND m.weekday=$1 AND m.starts_at<$3::time AND m.ends_at>$2::time AND t.starts_on<=proposed.ends_on AND proposed.starts_on<=t.ends_on AND (m.room_id=$4 OR s.teacher_id=$5 OR s.id=$7 OR EXISTS(SELECT 1 FROM enrollments a JOIN enrollments z ON a.student_id=z.student_id WHERE a.section_id=$7 AND z.section_id=s.id AND a.status='active' AND z.status='active'))`,
        [weekday, start, end, room, s.teacher_id, s.term_id, s.id],
      );
      if (conflict.rowCount)
        throw schoolError(
          409,
          "This time conflicts with a room, teacher, or enrolled student.",
        );
      const capacity = (
        await client.query("SELECT capacity FROM rooms WHERE id=$1", [room])
      ).rows[0]?.capacity;
      if (!capacity || capacity < s.capacity)
        throw schoolError(
          409,
          "The room is too small for this class capacity.",
        );
      await q(
        "INSERT INTO meetings(section_id,room_id,weekday,starts_at,ends_at) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [s.id, room, weekday, start, end],
      );
      break;
    }
    case "class_sessions": {
      await sectionAccess(client, user, b.section_id, true);
      if (b.id)
        await q(
          "UPDATE class_sessions SET cancelled=$3 WHERE id=$1 AND section_id=$2 RETURNING *",
          [id(b.id), id(b.section_id), boolean(b.cancelled)],
        );
      else
        await q(
          "INSERT INTO class_sessions(section_id,held_on,title) VALUES($1,$2,$3) RETURNING *",
          [id(b.section_id), date(b.held_on), text(b.title)],
        );
      break;
    }
    case "attendance": {
      staff(user);
      const session = (
        await client.query(
          "SELECT * FROM class_sessions WHERE id=$1 FOR UPDATE",
          [id(b.session_id)],
        )
      ).rows[0];
      if (!session || session.cancelled)
        throw schoolError(400, "Select an active class session.");
      await sectionAccess(client, user, session.section_id, true);
      await enrolled(client, session.section_id, b.student_id);
      const old = (
        await client.query(
          "SELECT status FROM attendance WHERE session_id=$1 AND student_id=$2",
          [session.id, id(b.student_id)],
        )
      ).rows[0];
      if (old && old.status !== b.status && !String(b.note || "").trim())
        throw schoolError(400, "A correction reason is required.");
      await q(
        "INSERT INTO attendance(session_id,student_id,status,note) VALUES($1,$2,$3,$4) ON CONFLICT(session_id,student_id) DO UPDATE SET status=$3,note=$4,updated_at=now() RETURNING *",
        [
          session.id,
          id(b.student_id),
          choice(b.status, ["present", "absent", "late", "excused"]),
          text(b.note || "", 1000, false),
        ],
      );
      break;
    }
    case "assignments":
    case "assessments":
    case "exams": {
      staff(user);
      const s = await sectionAccess(client, user, b.section_id, true);
      const kind =
        resource === "assignments"
          ? "assignment"
          : resource === "exams"
            ? "exam"
            : "other";
      let assessment;
      if (b.id) {
        const aid =
          resource === "assessments"
            ? id(b.id)
            : (
                await client.query(
                  `SELECT assessment_id FROM ${resource} WHERE id=$1`,
                  [id(b.id)],
                )
              ).rows[0]?.assessment_id;
        if (!aid) throw schoolError(404, "Assessment not found.");
        assessment = (
          await client.query(
            "UPDATE assessments SET title=$3,points=$4,weight=$5,published=$6 WHERE id=$1 AND section_id=$2 RETURNING *",
            [
              aid,
              s.id,
              text(b.title),
              number(b.points, 0.01, 100000),
              number(b.weight, 0.01, 100),
              boolean(b.published),
            ],
          )
        ).rows[0];
      } else
        assessment = (
          await client.query(
            "INSERT INTO assessments(section_id,title,kind,points,weight,published) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              s.id,
              text(b.title),
              kind,
              number(b.points, 0.01, 100000),
              number(b.weight, 0.01, 100),
              boolean(b.published),
            ],
          )
        ).rows[0];
      if (!assessment)
        throw schoolError(404, "Assessment not found in this class.");
      if (b.category_id) {
        const category = (
          await client.query(
            "SELECT id FROM assessment_categories WHERE id=$1 AND section_id=$2",
            [id(b.category_id), s.id],
          )
        ).rows[0];
        if (!category)
          throw schoolError(400, "Choose a category from this class.");
        await client.query(
          "UPDATE assessments SET category_id=$2 WHERE id=$1",
          [assessment.id, category.id],
        );
        assessment.category_id = category.id;
      }
      if (Object.hasOwn(b, "category_id") && !b.category_id) {
        await client.query(
          "UPDATE assessments SET category_id=NULL WHERE id=$1",
          [assessment.id],
        );
        assessment.category_id = null;
      }
      const overweight =
        Number(
          (
            await client.query(
              "SELECT sum(weight) AS weight FROM assessments WHERE section_id=$1 AND NOT archived AND category_id IS NOT DISTINCT FROM $2",
              [s.id, assessment.category_id || null],
            )
          ).rows[0].weight,
        ) > 100;
      if (overweight)
        throw schoolError(
          400,
          "Assessment weights for this class cannot exceed 100%.",
        );
      const invalidScores = await client.query(
        "SELECT 1 FROM scores WHERE assessment_id=$1 AND coalesce(raw_points,points)>$2",
        [assessment.id, assessment.points],
      );
      if (invalidScores.rowCount)
        throw schoolError(
          400,
          "Maximum points cannot be lower than an existing score.",
        );
      if (resource === "assignments")
        await q(
          "INSERT INTO assignments(assessment_id,instructions,due_at,allow_late) VALUES($1,$2,$3,$4) ON CONFLICT(assessment_id) DO UPDATE SET instructions=$2,due_at=$3,allow_late=$4 RETURNING *",
          [
            assessment.id,
            text(b.instructions || "", 12000, false),
            date(b.due_at),
            boolean(b.allow_late),
          ],
        );
      else if (resource === "exams") {
        await client.query("SELECT pg_advisory_xact_lock(724614)");
        const start = date(b.starts_at),
          end = date(b.ends_at),
          room = id(b.room_id);
        await eventSlot(client, s, room, start, end, {
          assessmentId: assessment.id,
        });
        const clash = await client.query(
          `SELECT 1 FROM exams e JOIN assessments a ON a.id=e.assessment_id JOIN sections s ON s.id=a.section_id WHERE e.assessment_id<>$1 AND e.starts_at<$3::timestamptz AND e.ends_at>$2::timestamptz AND (e.room_id=$4 OR s.teacher_id=$5 OR s.id=$6 OR EXISTS(SELECT 1 FROM enrollments x JOIN enrollments y ON x.student_id=y.student_id WHERE x.section_id=$6 AND y.section_id=s.id AND x.status='active' AND y.status='active'))`,
          [assessment.id, start, end, room, s.teacher_id, s.id],
        );
        if (clash.rowCount)
          throw schoolError(409, "This exam conflicts with another exam.");
        await q(
          "INSERT INTO exams(assessment_id,starts_at,ends_at,room_id,instructions) VALUES($1,$2,$3,$4,$5) ON CONFLICT(assessment_id) DO UPDATE SET starts_at=$2,ends_at=$3,room_id=$4,instructions=$5 RETURNING *",
          [
            assessment.id,
            start,
            end,
            room,
            text(b.instructions || "", 12000, false),
          ],
        );
      } else row = assessment;
      await client.query(
        "UPDATE final_grades SET published=false WHERE section_id=$1",
        [s.id],
      );
      if (assessment.published)
        await notify(
          client,
          s.id,
          `${assessment.title} is available`,
          resource === "exams" ? "/exams" : "/assignments",
          "assignments",
        );
      break;
    }
    case "submissions": {
      if (user.role !== "student")
        throw schoolError(403, "Only students can submit work.");
      const a = (
        await client.query(
          "SELECT a.*,x.section_id,x.published,x.archived FROM assignments a JOIN assessments x ON x.id=a.assessment_id WHERE a.id=$1 FOR UPDATE OF a",
          [id(b.assignment_id)],
        )
      ).rows[0];
      if (!a || !a.published || a.archived)
        throw schoolError(404, "Assignment not found.");
      const s = await sectionAccess(client, user, a.section_id);
      await enrolled(client, a.section_id, user.id);
      if (s.archived) throw schoolError(409, "This class is archived.");
      if (new Date(a.due_at) < new Date() && !a.allow_late)
        throw schoolError(409, "The submission deadline has passed.");
      await q(
        "INSERT INTO submissions(assignment_id,student_id,content) VALUES($1,$2,$3) ON CONFLICT(assignment_id,student_id) DO UPDATE SET content=$3,submitted_at=now() RETURNING *",
        [a.id, user.id, text(b.content, 12000)],
      );
      await client.query(
        "INSERT INTO submission_versions(submission_id,content) VALUES($1,$2)",
        [row.id, row.content],
      );
      await client.query(
        "UPDATE scores SET published=false WHERE assessment_id=$1 AND student_id=$2",
        [a.assessment_id, user.id],
      );
      await client.query(
        "UPDATE final_grades SET published=false WHERE section_id=$1 AND student_id=$2",
        [a.section_id, user.id],
      );
      await client.query(
        "INSERT INTO notifications(user_id,title,href) VALUES($1,$2,$3)",
        [s.teacher_id, "New assignment submission", "/assignments"],
      );
      break;
    }
    case "scores": {
      staff(user);
      const a = (
        await client.query("SELECT * FROM assessments WHERE id=$1", [
          id(b.assessment_id),
        ])
      ).rows[0];
      if (!a) throw schoolError(404, "Assessment not found.");
      await sectionAccess(client, user, a.section_id, true);
      await enrolled(client, a.section_id, b.student_id);
      const before = (
        await client.query(
          "SELECT * FROM scores WHERE assessment_id=$1 AND student_id=$2",
          [a.id, id(b.student_id)],
        )
      ).rows[0];
      await q(
        "INSERT INTO scores(assessment_id,student_id,points,feedback,published) VALUES($1,$2,$3,$4,$5) ON CONFLICT(assessment_id,student_id) DO UPDATE SET points=$3,feedback=$4,published=$5,updated_at=now() RETURNING *",
        [
          a.id,
          id(b.student_id),
          number(b.points, 0, Number(a.points)),
          text(b.feedback || "", 4000, false),
          boolean(b.published),
        ],
      );
      const policy = (
        await client.query(
          "SELECT value FROM school_settings WHERE key='grading'",
        )
      ).rows[0].value;
      const late =
        (
          await client.query(
            "SELECT 1 FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id WHERE a.assessment_id=$1 AND sub.student_id=$2 AND sub.submitted_at>a.due_at",
            [a.id, id(b.student_id)],
          )
        ).rowCount > 0;
      const penalty = late
        ? (Number(a.points) * Number(policy.late_penalty_percent || 0)) / 100
        : 0;
      row = (
        await client.query(
          "UPDATE scores SET exempt=$2,raw_points=points,late_penalty=$3,points=greatest(0,points-$3) WHERE id=$1 RETURNING *",
          [row.id, boolean(b.exempt), penalty],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO grade_history(assessment_id,student_id,actor_id,before_value,after_value,reason) VALUES($1,$2,$3,$4,$5,$6)",
        [
          a.id,
          id(b.student_id),
          user.id,
          JSON.stringify(before || null),
          JSON.stringify(row),
          text(b.reason || "", 1000, false),
        ],
      );
      await client.query(
        "UPDATE final_grades SET published=false WHERE section_id=$1 AND student_id=$2",
        [a.section_id, id(b.student_id)],
      );
      if (row.published)
        await client.query(
          "INSERT INTO notifications(user_id,title,href) SELECT $1,$2,$3 WHERE coalesce((SELECT notify_grades FROM profiles WHERE user_id=$1),true)",
          [id(b.student_id), `Grade released: ${a.title}`, "/grades"],
        );
      break;
    }
    case "materials": {
      await sectionAccess(client, user, b.section_id, true);
      const url = b.url ? text(b.url, 2000) : "";
      if (url && !/^https:\/\//i.test(url))
        throw schoolError(400, "Resource links must use HTTPS.");
      await q(
        "INSERT INTO materials(section_id,title,content,url) VALUES($1,$2,$3,$4) RETURNING *",
        [
          id(b.section_id),
          text(b.title),
          text(b.content || "", 12000, false),
          url,
        ],
      );
      break;
    }
    case "announcements": {
      staff(user);
      if (b.section_id) await sectionAccess(client, user, b.section_id, true);
      else admin(user);
      if (b.audience_role || b.program_id) admin(user);
      if (b.id) {
        const current = (
          await client.query("SELECT * FROM announcements WHERE id=$1", [
            id(b.id),
          ])
        ).rows[0];
        if (
          !current ||
          (user.role !== "admin" &&
            String(current.author_id) !== String(user.id))
        )
          throw schoolError(403, "You cannot edit this announcement.");
        await q(
          "UPDATE announcements SET section_id=$2,title=$3,content=$4,pinned=$5,publish_at=$6,expires_at=$7 WHERE id=$1 RETURNING *",
          [
            id(b.id),
            b.section_id ? id(b.section_id) : null,
            text(b.title),
            text(b.content, 12000),
            boolean(b.pinned),
            b.publish_at ? date(b.publish_at) : new Date(),
            b.expires_at ? date(b.expires_at) : null,
          ],
        );
      } else
        await q(
          "INSERT INTO announcements(author_id,section_id,title,content,pinned,publish_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            user.id,
            b.section_id ? id(b.section_id) : null,
            text(b.title),
            text(b.content, 12000),
            boolean(b.pinned),
            b.publish_at ? date(b.publish_at) : new Date(),
            b.expires_at ? date(b.expires_at) : null,
          ],
        );
      await client.query(
        "UPDATE announcements SET audience_role=$2,program_id=$3 WHERE id=$1",
        [
          row.id,
          b.audience_role
            ? choice(b.audience_role, ["student", "teacher", "admin"])
            : null,
          b.program_id ? id(b.program_id) : null,
        ],
      );
      if (row.section_id && new Date(row.publish_at) <= new Date())
        await notify(
          client,
          row.section_id,
          row.title,
          "/announcements",
          "announcements",
        );
      break;
    }
    case "announcement_reads": {
      const visible = (await readSchool(client, user)).announcements.some(
        (a) => String(a.id) === String(b.id),
      );
      if (!visible) throw schoolError(404, "Announcement not found.");
      await q(
        "INSERT INTO announcement_reads(announcement_id,user_id) VALUES($1,$2) ON CONFLICT(announcement_id,user_id) DO UPDATE SET read_at=now() RETURNING *",
        [id(b.id), user.id],
      );
      break;
    }
    case "notifications":
      await q(
        "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND ($2::bigint IS NULL OR id=$2) RETURNING *",
        [user.id, b.id ? id(b.id) : null],
      );
      break;
    case "profile": {
      await client.query("UPDATE users SET name=$2 WHERE id=$1", [
        user.id,
        text(b.name, 120),
      ]);
      await q(
        "INSERT INTO profiles(user_id,phone,address,emergency_name,emergency_phone) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET phone=$2,address=$3,emergency_name=$4,emergency_phone=$5 RETURNING *",
        [
          user.id,
          text(b.phone || "", 60, false),
          text(b.address || "", 500, false),
          text(b.emergency_name || "", 120, false),
          text(b.emergency_phone || "", 60, false),
        ],
      );
      break;
    }
    case "preferences": {
      const zone = text(b.timezone, 100);
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
      } catch {
        throw schoolError(400, "Unknown timezone.");
      }
      await q(
        "INSERT INTO profiles(user_id,timezone,theme,notify_assignments,notify_announcements,notify_grades) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET timezone=$2,theme=$3,notify_assignments=$4,notify_announcements=$5,notify_grades=$6 RETURNING *",
        [
          user.id,
          zone,
          choice(b.theme, ["light", "dark"]),
          boolean(b.notify_assignments),
          boolean(b.notify_announcements),
          boolean(b.notify_grades),
        ],
      );
      break;
    }
    case "unlink_google": {
      if (user.auth_provider !== "local" || !user.password)
        throw schoolError(
          400,
          "A password login is required before unlinking Google.",
        );
      if (
        !(await bcrypt.compare(
          String(b.current_password || ""),
          user.password.replace(/^\$2y\$/, "$2b$"),
        ))
      )
        throw schoolError(400, "Current password is incorrect.");
      await client.query("UPDATE users SET google_id=NULL WHERE id=$1", [
        user.id,
      ]);
      row = { id: user.id };
      break;
    }
    case "password": {
      if (user.auth_provider !== "local")
        throw schoolError(400, "Manage your password in your Google account.");
      if (
        !(await bcrypt.compare(
          String(b.current_password || ""),
          user.password?.replace(/^\$2y\$/, "$2b$") || "",
        ))
      )
        throw schoolError(400, "Current password is incorrect.");
      if (
        typeof b.password !== "string" ||
        b.password.length < 8 ||
        Buffer.byteLength(b.password) > 72
      )
        throw schoolError(400, "Use a password of 8–72 bytes.");
      await client.query("UPDATE users SET password=$2 WHERE id=$1", [
        user.id,
        await bcrypt.hash(b.password, 12),
      ]);
      await client.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
      row = { id: user.id };
      break;
    }
    case "sessions":
      await q(
        "DELETE FROM sessions WHERE user_id=$1 AND token_hash=$2 RETURNING expires_at",
        [user.id, text(b.id, 64)],
      );
      break;
    case "school_settings": {
      const timezone = text(b.timezone, 100);
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone });
      } catch {
        throw schoolError(400, "Unknown timezone.");
      }
      await q(
        "UPDATE school_settings SET value=$1 WHERE key='school' RETURNING *",
        [
          JSON.stringify({
            name: text(b.name, 120),
            timezone,
            attendance_threshold: number(b.attendance_threshold, 0, 100),
          }),
        ],
      );
      break;
    }
    default:
      throw schoolError(404, "Unknown school operation.");
  }
  // Audit safe structured fields; never persist password, tokens or submission contents here.
  const details =
    resource === "scores" || resource === "attendance" ? { ...row } : {};
  await client.query(
    "INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)",
    [
      user.id,
      b.id ? "update" : "save",
      resource,
      row?.id || null,
      JSON.stringify(details),
    ],
  );
  return row || {};
}
export async function schoolHandler(req, res, readBody) {
  if (!["GET", "POST"].includes(req.method))
    throw schoolError(405, "Method not allowed.");
  const client = await getPool().connect();
  try {
    const user = await authenticated(req, client);
    if (req.method === "GET")
      return res.end(
        JSON.stringify({ success: true, ...(await readSchool(client, user)) }),
      );
    const body = await readBody(req, 131072);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw schoolError(400, "Invalid request.");
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.actor_id',$1,true)", [
      String(user.id),
    ]);
    try {
      const result = await mutate(
        client,
        user,
        new URL(req.url, "http://localhost").searchParams.get("resource"),
        body,
      );
      await client.query("COMMIT");
      res.end(JSON.stringify({ success: true, record: result }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    if (
      ["23503", "23505", "23514", "22P02", "22007", "22008"].includes(
        error.code,
      )
    )
      throw schoolError(
        400,
        error.code === "23505"
          ? "This record already exists."
          : "Check the selected records, dates, and numeric values.",
      );
    throw error;
  } finally {
    client.release();
  }
}
