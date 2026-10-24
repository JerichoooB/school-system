import { randomBytes, createHash } from "node:crypto";
import {
  schoolError,
  sectionAccess,
  enrolled,
  text,
  id,
  number,
  date,
  admin,
  staff,
  boolean,
  choice,
} from "./school.js";
import { sendAccountEmail, requireMailConfig } from "./mail.js";
import { eventSlot } from "./scheduling.js";
import { weightedGrade } from "../shared/grades.js";
export const learningResources = [
  "resource_completions",
  "assessment_categories",
  "final_grades",
  "rubrics",
  "rubric_scores",
  "schedule_exceptions",
  "grading_policy",
  "invitations",
  "accept_invitation",
  "import_people",
  "catalog_update",
  "catalog_delete",
  "office_hours",
  "teacher_departments",
  "program_courses",
  "bulk_attendance",
  "content_update",
  "content_delete",
  "academic_years",
  "help_articles",
  "section_update",
  "assessment_archive",
  "retry_email",
];
export async function readLearning(client, user) {
  const args = [user.role, user.id],
    scope =
      "($1='admin' OR s.teacher_id=$2 OR EXISTS(SELECT 1 FROM enrollments e WHERE e.section_id=s.id AND e.student_id=$2 ))";
  const run = async (sql, values = args) =>
    (await client.query(sql, values)).rows;
  return {
    attendance_history: await run(
      `SELECT h.* FROM attendance_history h JOIN attendance a ON a.id=h.attendance_id JOIN class_sessions cs ON cs.id=a.session_id JOIN sections s ON s.id=cs.section_id WHERE $1='admin' OR s.teacher_id=$2 ORDER BY h.id DESC LIMIT 100`,
    ),
    academic_years: await run(
      "SELECT * FROM academic_years ORDER BY starts_on DESC",
      [],
    ),
    help_articles: await run(
      "SELECT * FROM help_articles WHERE published OR $1='admin' ORDER BY category,title",
      [user.role],
    ),
    faculty: await run(
      `SELECT DISTINCT u.id,u.name,u.email FROM users u JOIN sections s ON s.teacher_id=u.id WHERE ${scope} ORDER BY u.name`,
    ),
    office_hours: await run(
      `SELECT o.* FROM office_hours o WHERE $1='admin' OR o.teacher_id=$2 OR EXISTS(SELECT 1 FROM sections s WHERE s.teacher_id=o.teacher_id AND ${scope})`,
    ),
    teacher_departments: await run("SELECT * FROM teacher_departments", []),
    program_courses: await run("SELECT * FROM program_courses", []),
    import_jobs:
      user.role === "admin"
        ? await run("SELECT * FROM import_jobs ORDER BY id DESC LIMIT 50", [])
        : [],
    files: await run(
      `SELECT f.id,f.owner_id,f.section_id,f.submission_id,f.assignment_id,f.announcement_id,f.purpose,f.name,f.content_type,f.bytes,f.created_at FROM files f LEFT JOIN sections s ON s.id=f.section_id WHERE $1='admin' OR f.owner_id=$2 OR (f.purpose='announcement' AND EXISTS(SELECT 1 FROM announcements a LEFT JOIN profiles p ON p.user_id=$2 WHERE a.id=f.announcement_id AND a.publish_at<=now() AND (a.expires_at IS NULL OR a.expires_at>now()) AND (a.audience_role IS NULL OR a.audience_role=$1) AND (a.program_id IS NULL OR a.program_id=p.program_id) AND (a.section_id IS NULL OR EXISTS(SELECT 1 FROM enrollments e WHERE e.section_id=a.section_id AND e.student_id=$2 AND e.status='active')))) OR (s.teacher_id=$2) OR (f.purpose IN ('material','assignment') AND ${scope} AND (f.assignment_id IS NULL OR EXISTS(SELECT 1 FROM assignments a JOIN assessments x ON x.id=a.assessment_id WHERE a.id=f.assignment_id AND x.published))) ORDER BY f.created_at DESC`,
    ),
    resource_completions: await run(
      "SELECT * FROM resource_completions WHERE user_id=$1",
      [user.id],
    ),
    assessment_categories: await run(
      `SELECT c.* FROM assessment_categories c JOIN sections s ON s.id=c.section_id WHERE ${scope}`,
    ),
    final_grades: await run(
      `SELECT f.*,u.name AS student_name FROM final_grades f JOIN sections s ON s.id=f.section_id JOIN users u ON u.id=f.student_id WHERE ${scope} AND ($1<>'student' OR (f.student_id=$2 AND f.published))`,
    ),
    grade_history: await run(
      `SELECT h.* FROM grade_history h JOIN assessments a ON a.id=h.assessment_id JOIN sections s ON s.id=a.section_id WHERE ($1='admin' OR s.teacher_id=$2) ORDER BY h.id DESC LIMIT 100`,
    ),
    rubrics: await run(
      `SELECT r.* FROM rubrics r JOIN assignments a ON a.id=r.assignment_id JOIN assessments x ON x.id=a.assessment_id JOIN sections s ON s.id=x.section_id WHERE ${scope} AND ($1<>'student' OR x.published)`,
    ),
    rubric_scores: await run(
      `SELECT g.* FROM rubric_scores g JOIN submissions sub ON sub.id=g.submission_id JOIN assignments a ON a.id=sub.assignment_id JOIN assessments x ON x.id=a.assessment_id JOIN sections s ON s.id=x.section_id WHERE ${scope} AND ($1<>'student' OR (sub.student_id=$2 AND EXISTS(SELECT 1 FROM scores score WHERE score.assessment_id=x.id AND score.student_id=$2 AND score.published)))`,
    ),
    schedule_exceptions: await run(
      `SELECT x.*,r.name AS room_name FROM schedule_exceptions x LEFT JOIN sections s ON s.id=x.section_id LEFT JOIN rooms r ON r.id=x.room_id WHERE x.section_id IS NULL OR ${scope} ORDER BY x.starts_at`,
    ),
    invitations:
      user.role === "admin"
        ? await run(
            "SELECT id,email,role,expires_at,accepted_at FROM invitations ORDER BY id DESC",
            [],
          )
        : [],
    email_jobs:
      user.role === "admin"
        ? await run(
            "SELECT id,subject,state,attempts,next_attempt_at,sent_at FROM email_jobs ORDER BY id DESC LIMIT 100",
            [],
          )
        : [],
  };
}
export async function mutateLearning(client, user, resource, b) {
  const q = async (sql, args) => (await client.query(sql, args)).rows[0];
  let row;
  switch (resource) {
    case "retry_email": {
      admin(user);
      row = await q(
        "UPDATE email_jobs SET state='pending',attempts=0,next_attempt_at=now() WHERE id=$1 AND state<>'sent' RETURNING id",
        [id(b.id)],
      );
      break;
    }
    case "academic_years": {
      admin(user);
      row = await q(
        "INSERT INTO academic_years(name,starts_on,ends_on) VALUES($1,$2,$3) RETURNING *",
        [text(b.name), date(b.starts_on), date(b.ends_on)],
      );
      break;
    }
    case "help_articles": {
      admin(user);
      row = b.id
        ? await q(
            "UPDATE help_articles SET title=$2,content=$3,category=$4,published=$5 WHERE id=$1 RETURNING *",
            [
              id(b.id),
              text(b.title),
              text(b.content, 12000),
              text(b.category),
              boolean(b.published),
            ],
          )
        : await q(
            "INSERT INTO help_articles(title,content,category,published) VALUES($1,$2,$3,$4) RETURNING *",
            [
              text(b.title),
              text(b.content, 12000),
              text(b.category),
              boolean(b.published),
            ],
          );
      break;
    }
    case "assessment_archive": {
      staff(user);
      const a = await q("SELECT * FROM assessments WHERE id=$1", [id(b.id)]);
      if (!a) throw schoolError(404, "Assessment not found.");
      await sectionAccess(client, user, a.section_id, true);
      row = await q(
        "UPDATE assessments SET archived=$2 WHERE id=$1 RETURNING *",
        [a.id, boolean(b.archived)],
      );
      const activeWeight = (
        await q(
          "SELECT coalesce(sum(weight),0) AS weight FROM assessments WHERE section_id=$1 AND NOT archived AND category_id IS NOT DISTINCT FROM $2",
          [a.section_id, a.category_id],
        )
      ).weight;
      if (Number(activeWeight) > 100)
        throw schoolError(
          400,
          "Restoring this assessment would exceed 100% of the grading weight.",
        );
      await client.query(
        "UPDATE final_grades SET published=false WHERE section_id=$1",
        [a.section_id],
      );
      break;
    }
    case "section_update": {
      admin(user);
      await client.query("SELECT pg_advisory_xact_lock(724612)");
      await client.query("SELECT pg_advisory_xact_lock(724613)");
      const s = await sectionAccess(client, user, b.id, true);
      const teacher = await q(
        "SELECT id FROM users WHERE id=$1 AND role='teacher' AND status='active'",
        [id(b.teacher_id)],
      );
      if (!teacher) throw schoolError(400, "Choose an active teacher.");
      const count = await q(
        "SELECT count(*) AS count FROM enrollments WHERE section_id=$1 AND status='active'",
        [s.id],
      );
      if (Number(count.count) > number(b.capacity, 1, 10000))
        throw schoolError(
          409,
          "Capacity cannot be lower than current enrollment.",
        );
      const smallRoom = await client.query(
        "SELECT 1 FROM meetings m JOIN rooms r ON r.id=m.room_id WHERE m.section_id=$1 AND r.capacity<$2",
        [s.id, number(b.capacity, 1, 10000)],
      );
      if (smallRoom.rowCount)
        throw schoolError(
          409,
          "An assigned room is too small for the new capacity.",
        );
      const clash = await client.query(
        "SELECT 1 FROM meetings a JOIN meetings z ON z.weekday=a.weekday AND z.starts_at<a.ends_at AND z.ends_at>a.starts_at JOIN sections other ON other.id=z.section_id WHERE a.section_id=$1 AND other.id<>$1 AND other.teacher_id=$2 AND NOT other.archived AND other.term_id=$3",
        [s.id, teacher.id, s.term_id],
      );
      if (clash.rowCount) throw schoolError(409, "Teacher timetable conflict.");
      row = await q(
        "UPDATE sections SET teacher_id=$2,name=$3,capacity=$4 WHERE id=$1 RETURNING *",
        [s.id, teacher.id, text(b.name, 100), number(b.capacity, 1, 10000)],
      );
      break;
    }
    case "office_hours": {
      staff(user);
      const teacher = user.role === "admin" ? id(b.teacher_id) : user.id;
      if (b.remove) {
        row = await q(
          "DELETE FROM office_hours WHERE id=$1 AND teacher_id=$2 RETURNING id",
          [id(b.id), teacher],
        );
        break;
      }
      row = await q(
        "INSERT INTO office_hours(teacher_id,weekday,starts_at,ends_at,location) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          teacher,
          number(b.weekday, 1, 7),
          text(b.starts_at, 8),
          text(b.ends_at, 8),
          text(b.location),
        ],
      );
      break;
    }
    case "teacher_departments": {
      admin(user);
      const teacher = await q(
        "SELECT id FROM users WHERE id=$1 AND role='teacher'",
        [id(b.teacher_id)],
      );
      if (!teacher) throw schoolError(400, "Choose a teacher.");
      await client.query(
        "INSERT INTO teacher_departments(teacher_id,department_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [teacher.id, id(b.department_id)],
      );
      row = { id: teacher.id };
      break;
    }
    case "program_courses": {
      admin(user);
      await client.query(
        "INSERT INTO program_courses(program_id,course_id,year_level) VALUES($1,$2,$3) ON CONFLICT(program_id,course_id) DO UPDATE SET year_level=$3",
        [id(b.program_id), id(b.course_id), number(b.year_level, 1, 8)],
      );
      row = { id: id(b.program_id) };
      break;
    }
    case "bulk_attendance": {
      staff(user);
      const session = await q("SELECT * FROM class_sessions WHERE id=$1", [
        id(b.session_id),
      ]);
      if (!session || session.cancelled)
        throw schoolError(400, "Select an active session.");
      await sectionAccess(client, user, session.section_id, true);
      const status = choice(b.status, ["present", "absent", "late", "excused"]);
      const changed = await client.query(
        "INSERT INTO attendance(session_id,student_id,status,note) SELECT $1,e.student_id,$2,$3 FROM enrollments e WHERE e.section_id=$4 AND e.status='active' ON CONFLICT(session_id,student_id) DO UPDATE SET status=$2,note=$3,updated_at=now() RETURNING id",
        [
          session.id,
          status,
          text(b.note || "", 1000, false),
          session.section_id,
        ],
      );
      row = { marked: changed.rowCount };
      break;
    }
    case "content_update":
    case "content_delete": {
      const table = choice(b.table, [
        "materials",
        "announcements",
        "meetings",
        "schedule_exceptions",
      ]);
      const current = await q(`SELECT * FROM ${table} WHERE id=$1`, [id(b.id)]);
      if (!current) throw schoolError(404, "Record not found.");
      if (current.section_id)
        await sectionAccess(client, user, current.section_id, true);
      else admin(user);
      if (
        table === "announcements" &&
        user.role !== "admin" &&
        String(current.author_id) !== String(user.id)
      )
        throw schoolError(403, "Only the author can edit this announcement.");
      if (resource === "content_delete") {
        row = await q(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [
          current.id,
        ]);
        break;
      }
      if (table === "materials") {
        const url = b.url ? text(b.url, 2000) : "";
        if (url && !/^https:\/\//.test(url))
          throw schoolError(400, "Use an HTTPS link.");
        row = await q(
          "UPDATE materials SET title=$2,content=$3,url=$4 WHERE id=$1 RETURNING *",
          [current.id, text(b.title), text(b.content || "", 12000, false), url],
        );
      } else
        throw schoolError(400, "Use the dedicated editor for this record.");
      break;
    }
    case "resource_completions": {
      const m = await q("SELECT * FROM materials WHERE id=$1", [
        id(b.material_id),
      ]);
      if (!m) throw schoolError(404, "Resource not found.");
      await sectionAccess(client, user, m.section_id);
      if (user.role !== "student")
        throw schoolError(403, "Only students track resource completion.");
      if (b.completed === false)
        await client.query(
          "DELETE FROM resource_completions WHERE material_id=$1 AND user_id=$2",
          [m.id, user.id],
        );
      else
        await client.query(
          "INSERT INTO resource_completions(material_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [m.id, user.id],
        );
      row = { id: m.id };
      break;
    }
    case "assessment_categories": {
      await sectionAccess(client, user, b.section_id, true);
      await client.query("SELECT pg_advisory_xact_lock(724615)");
      row = b.id
        ? await q(
            "UPDATE assessment_categories SET name=$3,weight=$4 WHERE id=$1 AND section_id=$2 RETURNING *",
            [
              id(b.id),
              id(b.section_id),
              text(b.name),
              number(b.weight, 0.01, 100),
            ],
          )
        : await q(
            "INSERT INTO assessment_categories(section_id,name,weight) VALUES($1,$2,$3) RETURNING *",
            [id(b.section_id), text(b.name), number(b.weight, 0.01, 100)],
          );
      const total = await q(
        "SELECT sum(weight) AS weight FROM assessment_categories WHERE section_id=$1",
        [id(b.section_id)],
      );
      if (Number(total.weight) > 100)
        throw schoolError(400, "Category weights cannot exceed 100%.");
      await client.query(
        "UPDATE final_grades SET published=false WHERE section_id=$1",
        [id(b.section_id)],
      );
      break;
    }
    case "final_grades": {
      staff(user);
      await sectionAccess(client, user, b.section_id, true);
      await enrolled(client, b.section_id, b.student_id);
      const assessments = (
        await client.query(
          "SELECT * FROM assessments WHERE section_id=$1 AND NOT archived",
          [id(b.section_id)],
        )
      ).rows;
      const scores = (
        await client.query(
          "SELECT g.* FROM scores g JOIN assessments a ON a.id=g.assessment_id WHERE a.section_id=$1 AND g.student_id=$2",
          [id(b.section_id), id(b.student_id)],
        )
      ).rows;
      const categories = (
        await client.query(
          "SELECT * FROM assessment_categories WHERE section_id=$1",
          [id(b.section_id)],
        )
      ).rows;
      const policy = (
        await q("SELECT value FROM school_settings WHERE key='grading'", [])
      ).value;
      let percentage;
      try {
        percentage = weightedGrade(assessments, scores, categories, {
          complete: true,
          missingAsZero: policy.missing_as_zero === true,
        });
      } catch (e) {
        throw schoolError(400, e.message);
      }
      if (percentage == null)
        throw schoolError(400, "No non-exempt scores are available.");
      const band = [...policy.bands]
        .sort((a, b) => b.minimum - a.minimum)
        .find((band) => percentage >= band.minimum);
      row = await q(
        "INSERT INTO final_grades(section_id,student_id,percentage,letter,gpa,published,finalized_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(section_id,student_id) DO UPDATE SET percentage=$3,letter=$4,gpa=$5,published=$6,finalized_by=$7,updated_at=now() RETURNING *",
        [
          id(b.section_id),
          id(b.student_id),
          percentage.toFixed(2),
          band.letter,
          band.gpa,
          boolean(b.published),
          user.id,
        ],
      );
      break;
    }
    case "rubrics": {
      const a = await q(
        "SELECT a.*,x.section_id FROM assignments a JOIN assessments x ON x.id=a.assessment_id WHERE a.id=$1",
        [id(b.assignment_id)],
      );
      if (!a) throw schoolError(404, "Assignment not found.");
      await sectionAccess(client, user, a.section_id, true);
      row = await q(
        "INSERT INTO rubrics(assignment_id,title,maximum) VALUES($1,$2,$3) RETURNING *",
        [a.id, text(b.title), number(b.maximum, 0.01, 100000)],
      );
      break;
    }
    case "rubric_scores": {
      staff(user);
      const sub = await q(
        "SELECT sub.*,x.section_id,x.id AS assessment_id,x.points AS maximum FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id JOIN assessments x ON x.id=a.assessment_id WHERE sub.id=$1",
        [id(b.submission_id)],
      );
      if (!sub) throw schoolError(404, "Submission not found.");
      await sectionAccess(client, user, sub.section_id, true);
      const criteria = (
        await client.query("SELECT * FROM rubrics WHERE assignment_id=$1", [
          sub.assignment_id,
        ])
      ).rows;
      if (
        !criteria.length ||
        Math.abs(
          criteria.reduce((n, c) => n + Number(c.maximum), 0) -
            Number(sub.maximum),
        ) > 0.001
      )
        throw schoolError(
          400,
          "Rubric maximum points must equal assignment points.",
        );
      if (
        !Array.isArray(b.criteria) ||
        b.criteria.length !== criteria.length ||
        new Set(b.criteria.map((c) => String(c.id))).size !== criteria.length
      )
        throw schoolError(400, "Score every rubric criterion exactly once.");
      let total = 0;
      for (const c of criteria) {
        const value = b.criteria.find((r) => String(r.id) === String(c.id));
        if (!value) throw schoolError(400, "A criterion is missing.");
        const points = number(value.points, 0, Number(c.maximum));
        total += points;
        await client.query(
          "INSERT INTO rubric_scores(criterion_id,submission_id,points,feedback) VALUES($1,$2,$3,$4) ON CONFLICT(criterion_id,submission_id) DO UPDATE SET points=$3,feedback=$4",
          [c.id, sub.id, points, text(value.feedback || "", 1000, false)],
        );
      }
      const before = await q(
        "SELECT * FROM scores WHERE assessment_id=$1 AND student_id=$2",
        [sub.assessment_id, sub.student_id],
      );
      row = await q(
        "INSERT INTO scores(assessment_id,student_id,points,feedback,published) VALUES($1,$2,$3,$4,$5) ON CONFLICT(assessment_id,student_id) DO UPDATE SET points=$3,feedback=$4,published=$5,updated_at=now() RETURNING *",
        [
          sub.assessment_id,
          sub.student_id,
          total,
          text(b.feedback || "", 4000, false),
          boolean(b.published),
        ],
      );
      const policy = (
        await q("SELECT value FROM school_settings WHERE key='grading'", [])
      ).value;
      const late =
        (await q(
          "SELECT 1 FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id WHERE sub.id=$1 AND sub.submitted_at>a.due_at",
          [sub.id],
        )) != null;
      const penalty = late
        ? (Number(sub.maximum) * Number(policy.late_penalty_percent || 0)) / 100
        : 0;
      row = await q(
        "UPDATE scores SET raw_points=points,late_penalty=$2,points=greatest(0,points-$2) WHERE id=$1 RETURNING *",
        [row.id, penalty],
      );
      await client.query(
        "UPDATE final_grades SET published=false WHERE section_id=$1 AND student_id=$2",
        [sub.section_id, sub.student_id],
      );
      await client.query(
        "INSERT INTO grade_history(assessment_id,student_id,actor_id,before_value,after_value) VALUES($1,$2,$3,$4,$5)",
        [
          sub.assessment_id,
          sub.student_id,
          user.id,
          JSON.stringify(before || null),
          JSON.stringify(row),
        ],
      );
      break;
    }
    case "schedule_exceptions": {
      if (b.section_id) await sectionAccess(client, user, b.section_id, true);
      else admin(user);
      const kind = choice(b.kind, [
        "holiday",
        "cancellation",
        "event",
        "rescheduled",
      ]);
      if (["cancellation", "rescheduled"].includes(kind) && !b.section_id)
        throw schoolError(400, "Select a class for this change.");
      const start = date(b.starts_at),
        end = date(b.ends_at);
      if (new Date(end) <= new Date(start))
        throw schoolError(400, "End time must follow start time.");
      if (kind === "rescheduled") {
        const section = await sectionAccess(client, user, b.section_id, true);
        await eventSlot(client, section, id(b.room_id), start, end);
        if (!b.room_id) throw schoolError(400, "Choose a room.");
        await client.query("SELECT pg_advisory_xact_lock(724613)");
        const conflicts = await client.query(
          "SELECT 1 FROM schedule_exceptions WHERE kind='rescheduled' AND starts_at<$2::timestamptz AND ends_at>$1::timestamptz AND (room_id=$3 OR section_id=$4)",
          [start, end, id(b.room_id), id(b.section_id)],
        );
        if (conflicts.rowCount)
          throw schoolError(409, "Rescheduled class conflict.");
      }
      row = await q(
        "INSERT INTO schedule_exceptions(section_id,title,starts_at,ends_at,kind,room_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          b.section_id ? id(b.section_id) : null,
          text(b.title),
          start,
          end,
          kind,
          b.room_id ? id(b.room_id) : null,
        ],
      );
      break;
    }
    case "grading_policy": {
      admin(user);
      let bands;
      try {
        bands = typeof b.bands === "string" ? JSON.parse(b.bands) : b.bands;
      } catch {
        throw schoolError(400, "Enter a valid grading-scale JSON list.");
      }
      if (!Array.isArray(bands) || !bands.length || bands.length > 20)
        throw schoolError(400, "Provide between 1 and 20 grade bands.");
      bands = bands.map((band) => ({
        minimum: number(band.minimum, 0, 100),
        letter: text(band.letter, 10),
        gpa: number(band.gpa, 0, 10),
      }));
      if (
        !bands.some((b) => b.minimum === 0) ||
        new Set(bands.map((b) => b.minimum)).size !== bands.length
      )
        throw schoolError(
          400,
          "Grade bands need unique minimum percentages including zero.",
        );
      row = await q(
        "UPDATE school_settings SET value=$1 WHERE key='grading' RETURNING *",
        [
          JSON.stringify({
            bands,
            late_penalty_percent: number(b.late_penalty_percent, 0, 100),
            late_counts_present: boolean(b.late_counts_present),
            exclude_excused: boolean(b.exclude_excused),
            missing_as_zero: boolean(b.missing_as_zero),
          }),
        ],
      );
      break;
    }
    case "invitations": {
      admin(user);
      requireMailConfig();
      const email = text(b.email, 254).toLowerCase();
      const inviteName = b.name ? text(b.name, 120) : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw schoolError(400, "Enter a valid email.");
      const token = randomBytes(32).toString("hex");
      row = await q(
        "INSERT INTO invitations(email,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days') RETURNING id,email,role,expires_at",
        [
          email,
          choice(b.role, ["student", "teacher"]),
          createHash("sha256").update(token).digest("hex"),
          user.id,
        ],
      );
      const origin = new URL(process.env.APP_URL || "http://localhost:5173")
        .origin;
      await sendAccountEmail(
        email,
        "You’re invited to School Hub",
        `${inviteName ? `Hello ${inviteName},\n\n` : ""}You have been invited as a ${row.role}. Create or sign in to your account using this invitation: ${origin}/signup?invite=${token}\nThis invitation expires in seven days. Use the invited email address.`,
      );
      break;
    }
    case "accept_invitation": {
      if (!/^[a-f0-9]{64}$/.test(String(b.token)))
        throw schoolError(400, "Invalid invitation.");
      const invite = await q(
        "SELECT * FROM invitations WHERE token_hash=$1 AND email=$2 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE",
        [createHash("sha256").update(b.token).digest("hex"), user.email],
      );
      if (!invite)
        throw schoolError(
          400,
          "This invitation is expired, used, or for another email address.",
        );
      if (user.role !== "admin") {
        await client.query("UPDATE users SET role=$2 WHERE id=$1", [
          user.id,
          invite.role,
        ]);
      }
      row = await q(
        "UPDATE invitations SET accepted_at=now() WHERE id=$1 RETURNING id",
        [invite.id],
      );
      break;
    }
    case "import_people": {
      admin(user);
      await client.query("SELECT pg_advisory_xact_lock(724612)");
      if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > 100)
        throw schoolError(400, "Import between 1 and 100 rows per batch.");
      let count = 0;
      for (const item of b.rows) {
        const u = await q("SELECT * FROM users WHERE email=$1", [
          text(item.email, 254).toLowerCase(),
        ]);
        if (!u)
          throw schoolError(
            400,
            `Row ${count + 1}: account must sign up first.`,
          );
        const role = choice(item.role || "student", ["student", "teacher"]);
        if (u.role === "admin")
          throw schoolError(
            400,
            "Do not include administrator accounts in imports.",
          );
        if (
          u.role === "teacher" &&
          role !== "teacher" &&
          (
            await client.query(
              "SELECT 1 FROM sections WHERE teacher_id=$1 AND NOT archived",
              [u.id],
            )
          ).rowCount
        )
          throw schoolError(409, "A teacher has active class assignments.");
        await client.query("UPDATE users SET name=$2,role=$3 WHERE id=$1", [
          u.id,
          text(item.name, 120),
          role,
        ]);
        await client.query(
          "INSERT INTO profiles(user_id,student_number,program_id,year_level) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET student_number=$2,program_id=$3,year_level=$4",
          [
            u.id,
            item.student_number ? text(item.student_number, 50) : null,
            item.program_id ? id(item.program_id) : null,
            item.year_level ? number(item.year_level, 1, 8) : null,
          ],
        );
        count++;
      }
      row = await q(
        "INSERT INTO import_jobs(actor_id,row_count,state) VALUES($1,$2,'completed') RETURNING *",
        [user.id, count],
      );
      row.imported = count;
      break;
    }
    case "catalog_update": {
      admin(user);
      const defs = {
        academic_years: ["name", "starts_on", "ends_on"],
        departments: ["name"],
        programs: ["name", "department_id"],
        rooms: ["name", "capacity"],
        terms: ["name", "starts_on", "ends_on", "academic_year_id"],
        courses: ["name", "code", "credits", "description", "department_id"],
      };
      const table = choice(b.table, Object.keys(defs));
      const values = defs[table].map((key) =>
        key === "department_id" || key === "academic_year_id"
          ? b[key]
            ? id(b[key])
            : null
          : key === "capacity"
            ? number(b[key], 1, 10000)
            : key === "credits"
              ? number(b[key], 0.1, 30)
              : key.endsWith("_on")
                ? date(b[key])
                : text(
                    b[key] || "",
                    key === "description" ? 12000 : 200,
                    key !== "description",
                  ),
      );
      row = await q(
        `UPDATE ${table} SET ${defs[table].map((key, i) => `${key}=$${i + 2}`).join(",")} WHERE id=$1 RETURNING *`,
        [id(b.id), ...values],
      );
      if (!row) throw schoolError(404, "Record not found.");
      break;
    }
    case "catalog_delete": {
      admin(user);
      const table = choice(b.table, [
        "academic_years",
        "departments",
        "programs",
        "rooms",
        "terms",
        "courses",
      ]);
      row = await q(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [
        id(b.id),
      ]);
      if (!row) throw schoolError(404, "Record not found.");
      break;
    }
    default:
      throw schoolError(404, "Unknown operation.");
  }
  await client.query(
    "INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)",
    [user.id, "save", resource, row?.id || null],
  );
  return row || {};
}
