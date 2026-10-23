import { timingSafeEqual } from "node:crypto";
import { getPool } from "./db.js";
import { sendAccountEmail } from "./mail.js";
import { schoolError, authenticated } from "./school.js";
export async function jobsHandler(req, res) {
  const client = await getPool().connect();
  let sent = 0,
    failed = 0;
  try {
    if (req.method === "POST") {
      const user = await authenticated(req, client);
      if (user.role !== "admin")
        throw schoolError(403, "Administrator access is required.");
    } else if (req.method === "GET") {
      const secret = process.env.CRON_SECRET,
        authorization = req.headers.authorization || "";
      if (
        !secret ||
        Buffer.byteLength(authorization) !==
          Buffer.byteLength(`Bearer ${secret}`) ||
        !timingSafeEqual(
          Buffer.from(authorization),
          Buffer.from(`Bearer ${secret}`),
        )
      )
        throw schoolError(401, "Unauthorized.");
    } else throw schoolError(405, "Method not allowed.");
    const origin = new URL(process.env.APP_URL).origin;
    // One job per assignment/student. Retries never duplicate the logical reminder.
    await client.query(
      `INSERT INTO email_jobs(user_id,subject,content,dedupe_key) SELECT e.student_id,'Assignment due: '||x.title,'Your assignment is due within 24 hours. Open '||$1||'/assignments','assignment:'||a.id||':'||e.student_id FROM assignments a JOIN assessments x ON x.id=a.assessment_id JOIN sections s ON s.id=x.section_id JOIN enrollments e ON e.section_id=x.section_id JOIN users u ON u.id=e.student_id LEFT JOIN profiles p ON p.user_id=e.student_id WHERE x.published AND NOT s.archived AND e.status='active' AND u.status='active' AND coalesce(p.notify_assignments,true) AND a.due_at>now() AND a.due_at<=now()+interval '24 hours' AND NOT EXISTS(SELECT 1 FROM submissions sub WHERE sub.assignment_id=a.id AND sub.student_id=e.student_id) ON CONFLICT(dedupe_key) DO NOTHING`,
      [origin],
    );
    await client.query(
      `INSERT INTO email_jobs(user_id,subject,content,dedupe_key) SELECT u.id,a.title,a.content||E'\n'||$1||'/announcements','announcement:'||a.id||':'||u.id FROM announcements a JOIN users u ON u.status='active' LEFT JOIN profiles p ON p.user_id=u.id WHERE a.publish_at<=now() AND a.publish_at>now()-interval '7 days' AND (a.expires_at IS NULL OR a.expires_at>now()) AND coalesce(p.notify_announcements,true) AND (a.audience_role IS NULL OR a.audience_role=u.role) AND (a.program_id IS NULL OR a.program_id=p.program_id) AND (a.section_id IS NULL OR EXISTS(SELECT 1 FROM enrollments e WHERE e.section_id=a.section_id AND e.student_id=u.id AND e.status='active') OR EXISTS(SELECT 1 FROM sections s WHERE s.id=a.section_id AND s.teacher_id=u.id)) ON CONFLICT(dedupe_key) DO NOTHING`,
      [origin],
    );
    await client.query(
      `INSERT INTO email_jobs(user_id,subject,content,dedupe_key) SELECT g.student_id,'Grade released: '||a.title,'A grade is available. Open '||$1||'/grades','grade:'||g.id||':'||g.updated_at FROM scores g JOIN assessments a ON a.id=g.assessment_id JOIN users u ON u.id=g.student_id LEFT JOIN profiles p ON p.user_id=g.student_id WHERE g.published AND a.published AND NOT a.archived AND u.status='active' AND coalesce(p.notify_grades,true) ON CONFLICT(dedupe_key) DO NOTHING`,
      [origin],
    );
    await client.query(
      `INSERT INTO email_jobs(user_id,subject,content,dedupe_key) SELECT a.student_id,'Attendance reminder','Your recorded attendance is below the school threshold. Open '||$1||'/attendance','attendance:'||a.student_id||':'||current_date FROM attendance a JOIN class_sessions cs ON cs.id=a.session_id CROSS JOIN school_settings policy WHERE policy.key='grading' AND NOT cs.cancelled AND (NOT coalesce((policy.value->>'exclude_excused')::boolean,true) OR a.status<>'excused') GROUP BY a.student_id,policy.value HAVING 100.0*count(*) FILTER(WHERE a.status='present' OR (a.status='late' AND coalesce((policy.value->>'late_counts_present')::boolean,true)))/count(*) < (SELECT (value->>'attendance_threshold')::numeric FROM school_settings WHERE key='school') ON CONFLICT(dedupe_key) DO NOTHING`,
      [origin],
    );
    await client.query(
      `INSERT INTO notifications(user_id,title,href) SELECT u.id,a.title,'/announcements' FROM announcements a JOIN users u ON u.status='active' LEFT JOIN profiles p ON p.user_id=u.id WHERE a.publish_at<=now() AND a.publish_at>now()-interval '7 days' AND (a.expires_at IS NULL OR a.expires_at>now()) AND coalesce(p.notify_announcements,true) AND (a.audience_role IS NULL OR a.audience_role=u.role) AND (a.program_id IS NULL OR a.program_id=p.program_id) AND (a.section_id IS NULL OR EXISTS(SELECT 1 FROM enrollments e WHERE e.section_id=a.section_id AND e.student_id=u.id AND e.status='active')) AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=u.id AND n.title=a.title AND n.href='/announcements')`,
    );
    // Bound each invocation by both throughput and the Vercel function deadline.
    const started = Date.now();
    for (let i = 0; i < 100 && Date.now() - started < 240000; i++) {
      await client.query("BEGIN");
      const job = (
        await client.query(
          "SELECT j.*,u.email FROM email_jobs j JOIN users u ON u.id=j.user_id WHERE j.state IN ('pending','failed') AND j.attempts<5 AND j.next_attempt_at<=now() AND u.status='active' ORDER BY j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1",
        )
      ).rows[0];
      if (!job) {
        await client.query("COMMIT");
        break;
      }
      try {
        await sendAccountEmail(job.email, job.subject, job.content);
        await client.query(
          "UPDATE email_jobs SET state='sent',attempts=attempts+1,sent_at=now() WHERE id=$1",
          [job.id],
        );
        sent++;
      } catch {
        await client.query(
          "UPDATE email_jobs SET state='failed',attempts=attempts+1,next_attempt_at=now()+interval '15 minutes' * power(2,attempts) WHERE id=$1",
          [job.id],
        );
        failed++;
      }
      await client.query("COMMIT");
    }
    // Expired authentication material can be removed without deleting accounts or history.
    await client.query("DELETE FROM sessions WHERE expires_at<now()");
    await client.query("DELETE FROM auth_limits WHERE expires_at<now()");
    res.end(JSON.stringify({ success: true, sent, failed }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
