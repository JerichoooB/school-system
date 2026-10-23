import { schoolError } from "./school.js";
// All writers share the same advisory lock so concurrent timetable changes cannot race.
export async function eventSlot(
  client,
  section,
  roomId,
  start,
  end,
  { assessmentId = null } = {},
) {
  await client.query("SELECT pg_advisory_xact_lock(724613)");
  const timezone = (
    await client.query(
      "SELECT value->>'timezone' AS timezone FROM school_settings WHERE key='school'",
    )
  ).rows[0].timezone;
  const room = (
    await client.query("SELECT capacity FROM rooms WHERE id=$1", [roomId])
  ).rows[0];
  if (!room || room.capacity < section.capacity)
    throw schoolError(
      409,
      "Choose a room with enough capacity for this class.",
    );
  if (
    new Date(end) <= new Date(start) ||
    new Date(end) - new Date(start) > 86400000
  )
    throw schoolError(
      400,
      "An exam or rescheduled class must last between one minute and 24 hours.",
    );
  const args = [
    section.id,
    roomId,
    start,
    end,
    section.teacher_id,
    timezone,
    assessmentId,
  ];
  const conflicts = await client.query(
    `SELECT 1 FROM meetings m JOIN sections s ON s.id=m.section_id JOIN terms t ON t.id=s.term_id CROSS JOIN generate_series(($3::timestamptz AT TIME ZONE $6)::date,($4::timestamptz AT TIME ZONE $6)::date,interval '1 day') d WHERE NOT s.archived AND s.id<>$1 AND extract(isodow FROM d)=m.weekday AND d::date BETWEEN t.starts_on AND t.ends_on AND ((d::date+m.starts_at) AT TIME ZONE $6)<$4::timestamptz AND ((d::date+m.ends_at) AT TIME ZONE $6)>$3::timestamptz AND (m.room_id=$2 OR s.teacher_id=$5 OR EXISTS(SELECT 1 FROM enrollments x JOIN enrollments y ON x.student_id=y.student_id WHERE x.section_id=$1 AND y.section_id=s.id AND x.status='active' AND y.status='active')) AND NOT EXISTS(SELECT 1 FROM schedule_exceptions x WHERE x.kind IN ('holiday','cancellation') AND (x.section_id IS NULL OR x.section_id=s.id) AND x.starts_at<=((d::date+m.starts_at) AT TIME ZONE $6) AND x.ends_at>=((d::date+m.ends_at) AT TIME ZONE $6))`,
    args.slice(0, 6),
  );
  if (conflicts.rowCount)
    throw schoolError(
      409,
      "This event conflicts with a regular class timetable.",
    );
  const exams = await client.query(
    `SELECT 1 FROM exams e JOIN assessments a ON a.id=e.assessment_id JOIN sections s ON s.id=a.section_id WHERE NOT a.archived AND ($6::bigint IS NULL OR a.id<>$6) AND e.starts_at<$4::timestamptz AND e.ends_at>$3::timestamptz AND (e.room_id=$2 OR s.teacher_id=$5 OR s.id=$1 OR EXISTS(SELECT 1 FROM enrollments x JOIN enrollments y ON x.student_id=y.student_id WHERE x.section_id=$1 AND y.section_id=s.id AND x.status='active' AND y.status='active'))`,
    args.filter((_, i) => i !== 5),
  );
  if (exams.rowCount)
    throw schoolError(409, "This event conflicts with an exam.");
  const exceptions = await client.query(
    `SELECT 1 FROM schedule_exceptions x JOIN sections s ON s.id=x.section_id WHERE x.kind='rescheduled' AND x.starts_at<$4::timestamptz AND x.ends_at>$3::timestamptz AND (x.room_id=$2 OR s.teacher_id=$5 OR s.id=$1 OR EXISTS(SELECT 1 FROM enrollments a JOIN enrollments b ON a.student_id=b.student_id WHERE a.section_id=$1 AND b.section_id=s.id AND a.status='active' AND b.status='active'))`,
    args.slice(0, 5),
  );
  if (exceptions.rowCount)
    throw schoolError(409, "This event conflicts with a rescheduled class.");
}
