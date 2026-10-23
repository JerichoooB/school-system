import { GoogleLogin } from "@react-oauth/google";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  User,
  BookOpen,
  CalendarDays,
  ChartColumn,
  Clock,
  ClipboardPen,
  Megaphone,
  Settings,
  LogOut,
  GraduationCap,
  Users,
  School,
  Menu,
  Bell,
  X,
  HelpCircle,
  Plus,
  Download,
  ArrowUpRight,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "../context/useTheme";
import { schoolRequest, downloadCSV } from "./api";
import { Card, Empty, Stat, Badge, Table, FormDialog } from "./ui";
import "./school.css";
import Files from "./Files";
import Calendar from "./Calendar";
import AttendanceCalendar from "./AttendanceCalendar";
import { filterTerm } from "./filter";
import { exportCalendar } from "./calendarExport";
import {
  GradeTools,
  Rubric,
  PeopleTools,
  OfficeHours,
  ScheduleChanges,
} from "./Tools";
import { weightedGrade } from "../../shared/grades";
const navigation = [
  [
    "MAIN",
    [
      ["Dashboard", "dashboard", LayoutDashboard],
      ["Profile", "profile", User],
      ["Courses", "courses", BookOpen],
      ["Schedule", "schedule", CalendarDays],
    ],
  ],
  [
    "ACADEMICS",
    [
      ["Grades", "grades", ChartColumn],
      ["Attendance", "attendance", Clock],
      ["Assignments", "assignments", ClipboardPen],
      ["Exams", "exams", GraduationCap],
    ],
  ],
  ["COMMUNICATION", [["Announcements", "announcements", Megaphone]]],
  [
    "ADMINISTRATION",
    [
      ["Students", "students", Users],
      ["Teachers", "teachers", School],
    ],
  ],
];
const same = (a, b) => String(a) === String(b);
const field = (key, label, type = "text", extra = {}) => ({
  key,
  label,
  type,
  ...extra,
});
const select = (key, label, rows, labelKey = "name", extra = {}) =>
  field(key, label, "text", {
    options: rows.map((r) => ({ value: r.id, label: r[labelKey] })),
    ...extra,
  });
const options = (key, label, values) =>
  field(key, label, "text", {
    options: values.map((v) => ({ value: v, label: v })),
  });
const col = (key, label, render) => ({ key, label, render });
const stamp = (value, zone = "Asia/Manila") =>
  value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(new Date(value))
    : "—";
const day = (value) => (value ? String(value).slice(0, 10) : "—");
export default function Portal() {
  const location = useLocation(),
    navigate = useNavigate();
  const page = location.pathname.split("/")[1];
  const [allData, setData] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dialog, setDialog] = useState(null),
    [menu, setMenu] = useState(false),
    [bells, setBells] = useState(false),
    [selectedCourse, setSelectedCourse] = useState(""),
    [filter, setFilter] = useState(""),
    [assignmentTab, setAssignmentTab] = useState("Upcoming"),
    [scheduleMode, setScheduleMode] = useState("week"),
    [termFilter, setTermFilter] = useState("all");
  const { darkMode, toggleTheme, setAppearance } = useTheme();
  const lastLoaded = useRef(0);
  const load = useCallback(async () => {
    const result = await schoolRequest();
    setData(result);
    lastLoaded.current = Date.now();
    return result;
  }, []);
  useEffect(() => {
    let active = true;
    schoolRequest()
      .then(async (result) => {
        const token = sessionStorage.getItem("school-invitation");
        if (token) {
          try {
            await schoolRequest("accept_invitation", { token });
            sessionStorage.removeItem("school-invitation");
            result = await schoolRequest();
          } catch (e) {
            if (active) setError(e.message);
            sessionStorage.removeItem("school-invitation");
          }
        }
        if (active) {
          setData(result);
          lastLoaded.current = Date.now();
          if (result.profile[0]?.theme) setAppearance(result.profile[0].theme);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [setAppearance]);
  // Keep navigation immediate while periodically revalidating server-owned data.
  // Nothing is cached in browser storage, and every mutation is authorized by the API.
  useEffect(() => {
    let active = true, refreshing = false;
    async function refresh() {
      if (document.visibilityState !== "visible" || refreshing ||
          !lastLoaded.current || Date.now() - lastLoaded.current < 60000) return;
      refreshing = true;
      try {
        const result = await schoolRequest();
        if (active) {
          setData(result);
          lastLoaded.current = Date.now();
        }
      } catch (e) {
        if (active) {
          if (e.status === 401 || e.status === 403) navigate("/", { replace: true });
          else setError(e.message);
        }
      } finally {
        refreshing = false;
      }
    }
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [navigate]);
  async function save(resource, values) {
    await schoolRequest(resource, values);
    if (resource === "preferences" && (values.theme === "dark") !== darkMode)
      toggleTheme();
    await load();
    setNotice("Changes saved.");
  }
  function edit(resource, title, fields, initial = {}) {
    setDialog({
      title,
      fields: fields.map((f) => ({ ...f, timezone: zone })),
      initial,
      onSave: (values) => save(resource, values),
    });
  }
  async function act(resource, values) {
    setError("");
    try {
      await save(resource, values);
    } catch (e) {
      setError(e.message);
    }
  }
  async function toggleAppearance() {
    toggleTheme();
    try {
      await schoolRequest("preferences", {
        timezone: data?.profile[0]?.timezone || "Asia/Manila",
        theme: darkMode ? "light" : "dark",
        notify_assignments: data?.profile[0]?.notify_assignments ?? true,
        notify_announcements: data?.profile[0]?.notify_announcements ?? true,
        notify_grades: data?.profile[0]?.notify_grades ?? true,
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function logout() {
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error("Unable to sign out. Please retry.");
      localStorage.removeItem("user");
      navigate("/");
    } catch (e) {
      setError(e.message || "Unable to sign out. Please retry.");
    }
  }
  const data = filterTerm(allData, termFilter);
  if (!data)
    return (
      <main className="sh-start">
        <img src="/school-hub.svg" alt="School Hub" />
        <h1>School Hub</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              onClick={() => {
                setError("");
                load().catch((e) => setError(e.message));
              }}
            >
              Retry
            </button>
            <Link to="/">Sign in</Link>
          </>
        ) : (
          <p role="status">Loading your school workspace…</p>
        )}
      </main>
    );
  const { user } = data,
    isAdmin = user.role === "admin",
    isStaff = user.role !== "student";
  const avatar = data.files.find(
    (file) => file.purpose === "avatar" && same(file.owner_id, user.id),
  );
  const avatarContent = avatar ? (
    <img key={avatar.id} src={`/api/file?id=${avatar.id}`} alt="" />
  ) : user.name.slice(0, 1);
  const profile = data.profile[0] || {},
    zone = profile.timezone || "Asia/Manila";
  const grading =
    data.school_settings.find((s) => s.key === "grading")?.value || {};
  const school =
    data.school_settings.find((s) => s.key === "school")?.value || {};
  const courses = data.sections.filter(
      (s) =>
        !s.archived &&
        (isStaff ||
          data.enrollments.some(
            (e) => same(e.section_id, s.id) && e.status === "active",
          )),
    ),
    activeStudents = data.people.filter(
      (p) => p.role === "student" && p.status !== "inactive",
    );
  const sectionLabel = (record) => {
    const s = data.sections.find((s) => same(s.id, record.section_id));
    return s ? `${s.code} · ${s.name}` : "—";
  };
  const sectionOptions = select(
    "section_id",
    "Class",
    courses.map((s) => ({ ...s, name: `${s.code} · ${s.name}` })),
  );
  const studentsField = select("student_id", "Student", activeStudents);
  const gradeGroups = [];
  for (const score of data.scores.filter((g) => g.published)) {
    const key = `${score.student_id}-${score.section_id}`;
    if (gradeGroups.some((g) => g.id === key)) continue;
    const assessments = data.assessments.filter((a) =>
      same(a.section_id, score.section_id),
    );
    const scores = data.scores.filter(
      (g) =>
        g.published &&
        same(g.section_id, score.section_id) &&
        same(g.student_id, score.student_id),
    );
    const value = weightedGrade(
      assessments,
      scores,
      data.assessment_categories.filter((c) =>
        same(c.section_id, score.section_id),
      ),
    );
    if (value != null)
      gradeGroups.push({
        id: key,
        section_id: score.section_id,
        student_name: score.student_name,
        total: value,
        weight: 100,
      });
  }
  const average = gradeGroups.length
    ? gradeGroups.reduce((sum, g) => sum + (g.total / g.weight) * 100, 0) /
      gradeGroups.length
    : null;
  const counted = data.attendance.filter(
    (a) =>
      (!grading.exclude_excused || a.status !== "excused") &&
      !data.class_sessions.find((s) => same(s.id, a.session_id))?.cancelled,
  );
  const attendanceRate = counted.length
    ? Math.round(
        (counted.filter(
          (a) =>
            a.status === "present" ||
            (grading.late_counts_present !== false && a.status === "late"),
        ).length /
          counted.length) *
          100,
      )
    : null;
  const submitted = (id) =>
    data.submissions.find(
      (s) => same(s.assignment_id, id) && same(s.student_id, user.id),
    );
  const pending = data.assignments.filter(
    (a) => !submitted(a.id) && new Date(a.due_at) >= new Date(),
  );
  const exportButton = (name, rows) => (
    <button
      disabled={!rows.length}
      onClick={() => downloadCSV(`${name}.csv`, rows)}
    >
      <Download size={15} />
      Export CSV
    </button>
  );
  const add = (label, handler) => (
    <button className="sh-primary" onClick={handler}>
      <Plus size={16} />
      {label}
    </button>
  );
  const title =
    navigation.flatMap((g) => g[1]).find((i) => i[1] === page)?.[0] ||
    { settings: "Settings", help: "Help & Support" }[page];
  if (!title) return <Navigate to="/dashboard" replace />;
  if (["students", "teachers"].includes(page) && !isAdmin)
    return <Navigate to="/dashboard" replace />;
  function assessmentFields(kind) {
    return [
      sectionOptions,
      field("title", "Title"),
      field("points", "Maximum points", "number", {
        min: 0.01,
        max: 100000,
        step: 0.01,
      }),
      field("weight", "Weight (%)", "number", {
        min: 0.01,
        max: 100,
        step: 0.01,
        help: "All assessment weights in a class must total no more than 100%.",
      }),
      ...(kind === "assignments"
        ? [
            field("instructions", "Instructions", "textarea"),
            field("due_at", "Due date and time", "datetime-local"),
            field("allow_late", "Allow late submissions", "checkbox"),
          ]
        : [
            field("starts_at", "Starts at", "datetime-local"),
            field("ends_at", "Ends at", "datetime-local"),
            select("room_id", "Room", data.rooms),
            field("instructions", "Instructions", "textarea"),
          ]),
      select(
        "category_id",
        "Grading category",
        data.assessment_categories,
        "name",
        { optional: true },
      ),
      field("published", "Publish to students", "checkbox"),
    ];
  }
  function renderDashboard() {
    return (
      <>
        <div className="sh-welcome">
          <div>
            <span className="sh-eyebrow">YOUR SCHOOL, CONNECTED</span>
            <h2>Welcome back, {user.name.split(" ")[0]}.</h2>
            <p>
              {isAdmin
                ? "Keep your school running smoothly."
                : isStaff
                  ? "Your classes and students, in one place."
                  : "A little progress each day adds up to big results."}
            </p>
          </div>
          <GraduationCap size={92} strokeWidth={1} />
        </div>
        <div className="sh-stats">
          <Stat
            label={isAdmin ? "School accounts" : "Active courses"}
            value={isAdmin ? data.people.length : courses.length}
          />
          <Stat
            label="Average released grade"
            value={average == null ? "—" : `${average.toFixed(1)}%`}
            detail="Weighted over released assessments"
          />
          <Stat
            label="Recorded attendance"
            value={attendanceRate == null ? "—" : `${attendanceRate}%`}
          />
          <Stat
            label={isStaff ? "Published assignments" : "Assignments due"}
            value={
              isStaff
                ? data.assignments.filter((a) => a.published).length
                : pending.length
            }
          />
        </div>
        <div className="sh-grid">
          <Card
            title="Your classes"
            action={<Link to="/courses">View courses →</Link>}
          >
            {courses.length ? (
              courses.slice(0, 5).map((s) => (
                <Link className="sh-list-item" to="/courses" key={s.id}>
                  <span>
                    <b>{s.course_name}</b>
                    <small>
                      {s.code} · {s.name} · {s.teacher_name}
                    </small>
                  </span>
                  <ArrowUpRight size={18} />
                </Link>
              ))
            ) : (
              <Empty>Your administrator hasn’t assigned any classes yet.</Empty>
            )}
          </Card>
          <Card
            title="Upcoming deadlines"
            action={<Link to="/assignments">View assignments →</Link>}
          >
            {pending.length ? (
              pending.slice(0, 5).map((a) => (
                <Link className="sh-list-item" to="/assignments" key={a.id}>
                  <span>
                    <b>{a.title}</b>
                    <small>{sectionLabel(a)}</small>
                  </span>
                  <Badge>{stamp(a.due_at, zone)}</Badge>
                </Link>
              ))
            ) : (
              <Empty>You’re all caught up.</Empty>
            )}
          </Card>
          <Card
            title="Recent announcements"
            action={<Link to="/announcements">View all →</Link>}
          >
            {data.announcements.length ? (
              data.announcements.slice(0, 3).map((a) => (
                <article className="sh-list-item" key={a.id}>
                  <span>
                    <b>{a.title}</b>
                    <small>{a.content.slice(0, 160)}</small>
                  </span>
                </article>
              ))
            ) : (
              <Empty>No announcements yet.</Empty>
            )}
          </Card>
          <Card title="Academic progress">
            <p>Released assessment averages by course</p>
            {gradeGroups.length ? (
              gradeGroups.slice(0, 5).map((g) => (
                <div className="sh-progress" key={g.id}>
                  <span>
                    {sectionLabel(g)} {isStaff ? `· ${g.student_name}` : ""}
                  </span>
                  <strong>{((g.total / g.weight) * 100).toFixed(1)}%</strong>
                  <progress
                    aria-label={`Grade for ${sectionLabel(g)}`}
                    max="100"
                    value={(g.total / g.weight) * 100}
                  />
                </div>
              ))
            ) : (
              <Empty>Your progress appears after grades are released.</Empty>
            )}
          </Card>
        </div>
      </>
    );
  }
  function renderProfile() {
    return (
      <>
        <div className="sh-profile-banner">
          <div className="sh-avatar large">{avatarContent}</div>
          <div>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
            <Badge>{user.role}</Badge>
          </div>
        </div>
        <div className="sh-grid">
          <ProfileInformation
            user={user}
            profile={profile}
            onSave={(values) => save("profile", values)}
          />
          <Card title="Academic information">
            <dl>
              <dt>Student number</dt>
              <dd>{profile.student_number || "Not assigned"}</dd>
              <dt>Program</dt>
              <dd>
                {data.programs.find((p) => same(p.id, profile.program_id))
                  ?.name || "Not assigned"}
              </dd>
              <dt>Year level</dt>
              <dd>{profile.year_level || "Not assigned"}</dd>
              <dt>Active courses</dt>
              <dd>{courses.length}</dd>
            </dl>
            <small>
              Contact your administrator to update official records.
            </small>
          </Card>
          <Card title="Your files">
            <Files
              files={data.files.filter((f) => same(f.owner_id, user.id))}
              purpose="avatar"
              title="Profile photos"
              canUpload
              onChanged={load}
            />
            <Files
              files={data.files.filter((f) => same(f.owner_id, user.id))}
              purpose="document"
              title="Personal documents"
              canUpload
              onChanged={load}
            />
          </Card>
          <ProfileInformation
            user={user}
            profile={profile}
            emergency
            onSave={(values) => save("profile", values)}
          />
        </div>
      </>
    );
  }
  function renderCourses() {
    const selected = data.sections.find((s) => same(s.id, selectedCourse));
    return (
      <>
        <div className="sh-toolbar">
          <label className="sh-search">
            <input
              aria-label="Search courses"
              placeholder="Search your courses…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          {isAdmin &&
            add("Create class", () =>
              edit("sections", "Create class", [
                select("course_id", "Course", data.courses),
                select("term_id", "Term", data.terms),
                select(
                  "teacher_id",
                  "Teacher",
                  data.people.filter(
                    (p) => p.role === "teacher" && p.status === "active",
                  ),
                ),
                field("name", "Section name"),
                field("capacity", "Capacity", "number", { min: 1, max: 10000 }),
              ]),
            )}
        </div>
        {selected ? (
          <Card
            title={`${selected.code} · ${selected.course_name}`}
            action={
              <button onClick={() => setSelectedCourse("")}>
                Back to courses
              </button>
            }
          >
            <p>
              {
                data.courses.find((c) => same(c.id, selected.course_id))
                  ?.description
              }
            </p>
            <p>
              {selected.teacher_name} · {selected.term_name} ·{" "}
              {selected.credits} credits
            </p>
            {data.faculty.find((f) => same(f.id, selected.teacher_id)) && (
              <a
                href={`mailto:${data.faculty.find((f) => same(f.id, selected.teacher_id)).email}`}
              >
                Contact your teacher
              </a>
            )}
            <h3>Course materials</h3>
            {isStaff &&
              add("Add material", () =>
                edit(
                  "materials",
                  "Add learning resource",
                  [
                    field("title", "Title"),
                    field("content", "Content", "textarea", { optional: true }),
                    field("url", "HTTPS resource link", "url", {
                      optional: true,
                    }),
                  ],
                  { section_id: selected.id },
                ),
              )}
            {data.materials
              .filter((m) => same(m.section_id, selected.id))
              .map((m) => (
                <article className="sh-material" key={m.id}>
                  <h3>{m.title}</h3>
                  <p className="sh-prewrap">{m.content}</p>
                  {isStaff && (
                    <div className="sh-actions">
                      <button
                        onClick={() =>
                          edit(
                            "content_update",
                            "Edit resource",
                            [
                              field("title", "Title"),
                              field("content", "Content", "textarea", {
                                optional: true,
                              }),
                              field("url", "Resource URL", "url", {
                                optional: true,
                              }),
                            ],
                            { ...m, table: "materials" },
                          )
                        }
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          edit("content_delete", "Remove resource", [], {
                            id: m.id,
                            table: "materials",
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {!isStaff && (
                    <button
                      onClick={() =>
                        act("resource_completions", {
                          material_id: m.id,
                          completed: !data.resource_completions.some((c) =>
                            same(c.material_id, m.id),
                          ),
                        })
                      }
                    >
                      {data.resource_completions.some((c) =>
                        same(c.material_id, m.id),
                      )
                        ? "✓ Completed"
                        : "Mark complete"}
                    </button>
                  )}
                  {m.url && (
                    <a href={m.url} target="_blank" rel="noreferrer">
                      Open resource ↗
                    </a>
                  )}
                </article>
              ))}
            {!data.materials.some((m) => same(m.section_id, selected.id)) && (
              <Empty>No learning resources yet.</Empty>
            )}
            <Files
              files={data.files}
              purpose="material"
              sectionId={selected.id}
              title="Class attachments"
              canUpload={isStaff}
              onChanged={load}
            />
            <h3>Class timetable</h3>
            {data.meetings
              .filter((m) => same(m.section_id, selected.id))
              .map((m) => (
                <p key={m.id}>
                  {
                    [
                      "",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ][m.weekday]
                  }{" "}
                  · {m.starts_at.slice(0, 5)}–{m.ends_at.slice(0, 5)} ·{" "}
                  {m.room_name}
                </p>
              ))}
          </Card>
        ) : (
          <div className="sh-course-grid">
            {data.sections
              .filter((s) =>
                `${s.code} ${s.course_name} ${s.term_name}`
                  .toLowerCase()
                  .includes(filter.toLowerCase()),
              )
              .map((s) => (
                <Card key={s.id}>
                  <div className="sh-course-icon">
                    <BookOpen />
                  </div>
                  <span className="sh-eyebrow">
                    {s.code} · {s.name}
                  </span>
                  <h2>{s.course_name}</h2>
                  <p>{s.teacher_name}</p>
                  <small>
                    {s.term_name} · {s.credits} credits
                  </small>
                  {!isStaff && (
                    <p>
                      {
                        data.resource_completions.filter((c) =>
                          data.materials.some(
                            (m) =>
                              same(m.id, c.material_id) &&
                              same(m.section_id, s.id),
                          ),
                        ).length
                      }{" "}
                      /{" "}
                      {
                        data.materials.filter((m) => same(m.section_id, s.id))
                          .length
                      }{" "}
                      resources completed
                    </p>
                  )}
                  <p>
                    <Badge>
                      {s.archived ? "archived" : `${s.enrolled} enrolled`}
                    </Badge>
                  </p>
                  <button onClick={() => setSelectedCourse(s.id)}>
                    View course <ArrowUpRight size={16} />
                  </button>
                  {isAdmin && !s.archived && (
                    <button
                      onClick={() =>
                        edit(
                          "section_update",
                          "Edit class",
                          [
                            select(
                              "teacher_id",
                              "Teacher",
                              data.people.filter(
                                (p) =>
                                  p.role === "teacher" && p.status === "active",
                              ),
                            ),
                            field("name", "Section name"),
                            field("capacity", "Capacity", "number", {
                              min: 1,
                              max: 10000,
                            }),
                          ],
                          s,
                        )
                      }
                    >
                      Edit class
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() =>
                        act("sections", { id: s.id, archived: !s.archived })
                      }
                    >
                      {s.archived ? "Restore" : "Archive"}
                    </button>
                  )}
                </Card>
              ))}
          </div>
        )}
        {!data.sections.length && (
          <Empty>
            No classes yet. Administrators can create classes after setting up
            the course catalog.
          </Empty>
        )}
        {isAdmin && <AcademicSetup data={data} edit={edit} />}
      </>
    );
  }
  function calendarExport() {
    exportCalendar(data, school.timezone || "Asia/Manila");
  }
  function renderSchedule() {
    return (
      <>
        <div className="sh-toolbar">
          <div className="sh-tabs">
            {["week", "month", "list"].map((v) => (
              <button
                key={v}
                className={scheduleMode === v ? "active" : ""}
                onClick={() => setScheduleMode(v)}
              >
                {v === "week"
                  ? "Weekly timetable"
                  : v === "month"
                    ? "Month"
                    : "List view"}
              </button>
            ))}
          </div>
          {isAdmin &&
            add("Add class time", () =>
              edit("meetings", "Schedule a class", [
                sectionOptions,
                select("room_id", "Room", data.rooms),
                field("weekday", "Weekday (Monday = 1)", "number", {
                  min: 1,
                  max: 7,
                }),
                field("starts_at", "Start time", "time"),
                field("ends_at", "End time", "time"),
              ]),
            )}
        </div>
        <p className="sh-muted">
          Recurring school timetable · Times in{" "}
          {school.timezone || "Asia/Manila"}. Exam times use your account
          timezone.
        </p>
        {scheduleMode === "month" ? (
          <Calendar
            data={data}
            sectionLabel={sectionLabel}
            timezone={school.timezone || "Asia/Manila"}
          />
        ) : scheduleMode === "week" ? (
          <div className="sh-calendar">
            {[
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ].map((d, i) => (
              <Card title={d} key={d}>
                {data.meetings
                  .filter((m) => m.weekday === i + 1)
                  .map((m) => (
                    <article key={m.id} className="sh-class-block">
                      <b>{sectionLabel(m)}</b>
                      <span>
                        {m.starts_at.slice(0, 5)}–{m.ends_at.slice(0, 5)}
                      </span>
                      <small>{m.room_name}</small>
                      {isAdmin && (
                        <button
                          onClick={() =>
                            edit("content_delete", "Remove class time", [], {
                              table: "meetings",
                              id: m.id,
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </article>
                  ))}
                {!data.meetings.some((m) => m.weekday === i + 1) && (
                  <small className="sh-muted">No classes</small>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <Table
              rows={data.meetings.map((m) => ({
                ...m,
                course: sectionLabel(m),
              }))}
              columns={[
                col("course", "Class"),
                col(
                  "weekday",
                  "Day",
                  (m) =>
                    [
                      "",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ][m.weekday],
                ),
                col("starts_at", "Start"),
                col("ends_at", "End"),
                col("room_name", "Room"),
              ]}
            />
          </Card>
        )}
        <OfficeHours data={data} edit={edit} save={act} />
        <ScheduleChanges
          data={data}
          edit={edit}
          save={act}
          sectionLabel={sectionLabel}
        />
        <Card
          title="Upcoming exams"
          action={
            <button onClick={calendarExport}>
              <Download size={16} />
              Calendar export
            </button>
          }
        >
          <Table
            rows={data.exams.filter((e) => new Date(e.ends_at) >= new Date())}
            columns={[
              col("title", "Exam"),
              col("starts_at", "Start", (e) => stamp(e.starts_at, zone)),
              col("room_name", "Room"),
            ]}
          />
        </Card>
      </>
    );
  }
  function renderGrades() {
    return (
      <>
        <GradeTools
          data={data}
          edit={edit}
          isStaff={isStaff}
          sectionLabel={sectionLabel}
        />
        <div className="sh-stats">
          <Stat
            label="Average released grade"
            value={average == null ? "—" : `${average.toFixed(1)}%`}
          />
          <Stat
            label="Released scores"
            value={data.scores.filter((s) => s.published).length}
          />
          <Stat
            label="Published GPA"
            value={(() => {
              let total = 0,
                credits = 0;
              for (const g of data.final_grades.filter((g) => g.published)) {
                const c = Number(
                  data.sections.find((s) => same(s.id, g.section_id))
                    ?.credits || 0,
                );
                if (g.gpa != null) {
                  total += Number(g.gpa) * c;
                  credits += c;
                }
              }
              return credits ? (total / credits).toFixed(2) : "—";
            })()}
            detail="Weighted by course credits"
          />
          <Stat
            label="Enrolled credits"
            value={courses.reduce((sum, c) => sum + Number(c.credits), 0)}
          />
        </div>
        <Card title="Course averages">
          <p className="sh-muted">
            Weighted average over the available scores. A course result is
            provisional until all assessment weights and scores are complete.
          </p>
          <Table
            rows={gradeGroups.map((g) => ({
              ...g,
              course: sectionLabel(g),
              average: ((g.total / g.weight) * 100).toFixed(1) + "%",
              coverage: g.weight + "%",
            }))}
            columns={[
              col("course", "Course"),
              ...(isStaff ? [col("student_name", "Student")] : []),
              col("average", "Average"),
              col("coverage", "Scored weight"),
            ]}
          />
        </Card>
        <Card
          title="Assessment scores"
          action={
            isStaff &&
            add("Enter score", () =>
              edit("scores", "Enter or update score", [
                select(
                  "assessment_id",
                  "Assessment",
                  data.assessments,
                  "title",
                ),
                studentsField,
                field("points", "Points earned", "number", {
                  min: 0,
                  step: 0.01,
                }),
                field("feedback", "Feedback", "textarea", { optional: true }),
                field("reason", "Reason for change", "text", {
                  optional: true,
                }),
                field("exempt", "Exempt from grade calculation", "checkbox"),
                field("published", "Release to student", "checkbox"),
              ]),
            )
          }
        >
          <Table
            rows={data.scores}
            columns={[
              col("title", "Assessment"),
              ...(isStaff ? [col("student_name", "Student")] : []),
              col("points", "Score", (g) => `${g.points} / ${g.maximum}`),
              col("weight", "Weight", (g) => `${g.weight}%`),
              col("feedback", "Feedback"),
              col("published", "Status", (g) => (
                <Badge>{g.published ? "released" : "draft"}</Badge>
              )),
            ]}
            exportAction={exportButton("grades", data.scores)}
          />
        </Card>
      </>
    );
  }
  function renderAttendance() {
    return (
      <>
        <div className="sh-stats">
          <Stat
            label="Attendance rate"
            value={attendanceRate == null ? "—" : `${attendanceRate}%`}
            detail="Late counts as attended; excused sessions excluded"
          />
          {["present", "absent", "late"].map((s) => (
            <Stat
              key={s}
              label={s}
              value={counted.filter((a) => a.status === s).length}
            />
          ))}
        </div>
        {attendanceRate != null &&
          attendanceRate < Number(school.attendance_threshold ?? 75) && (
            <p className="sh-error" role="status">
              Attendance is below the school threshold of{" "}
              {school.attendance_threshold}%.
            </p>
          )}
        {isStaff && (
          <Card
            title="Class sessions"
            action={add("Create session", () =>
              edit("class_sessions", "Create class session", [
                sectionOptions,
                field("held_on", "Date", "date"),
                field("title", "Session title"),
              ]),
            )}
          >
            <Table
              rows={data.class_sessions}
              columns={[
                col("title", "Session"),
                col("section_id", "Class", sectionLabel),
                col("held_on", "Date", (s) => day(s.held_on)),
                col("cancelled", "Status", (s) => (
                  <Badge>{s.cancelled ? "cancelled" : "active"}</Badge>
                )),
                col("actions", "Actions", (s) => (
                  <button
                    onClick={() =>
                      act("class_sessions", {
                        id: s.id,
                        section_id: s.section_id,
                        cancelled: !s.cancelled,
                      })
                    }
                  >
                    {s.cancelled ? "Restore" : "Cancel session"}
                  </button>
                )),
              ]}
            />
          </Card>
        )}
        {isStaff && (
          <Card title="Bulk attendance">
            <button
              onClick={() =>
                edit("bulk_attendance", "Mark entire class", [
                  select(
                    "session_id",
                    "Session",
                    data.class_sessions.filter((s) => !s.cancelled),
                    "title",
                  ),
                  options("status", "Status", [
                    "present",
                    "absent",
                    "late",
                    "excused",
                  ]),
                  field("note", "Reason / note", "text", { optional: true }),
                ])
              }
            >
              Mark entire class
            </button>
          </Card>
        )}
        <AttendanceCalendar
          data={data}
          sectionLabel={sectionLabel}
          policy={grading}
        />
        <Card
          title="Attendance records"
          action={
            isStaff &&
            add("Mark attendance", () =>
              edit("attendance", "Mark or correct attendance", [
                select(
                  "session_id",
                  "Class session",
                  data.class_sessions
                    .filter((s) => !s.cancelled)
                    .map((s) => ({
                      ...s,
                      name: `${sectionLabel(s)} · ${day(s.held_on)} · ${s.title}`,
                    })),
                ),
                studentsField,
                options("status", "Status", [
                  "present",
                  "absent",
                  "late",
                  "excused",
                ]),
                field("note", "Reason or note", "textarea", { optional: true }),
              ]),
            )
          }
        >
          <Table
            rows={data.attendance}
            columns={[
              col("held_on", "Date", (a) => day(a.held_on)),
              col("section_id", "Class", sectionLabel),
              ...(isStaff ? [col("student_name", "Student")] : []),
              col("status", "Status", (a) => <Badge>{a.status}</Badge>),
              col("note", "Note"),
            ]}
            exportAction={exportButton("attendance", data.attendance)}
          />
        </Card>
      </>
    );
  }
  function renderAssignments() {
    const rows = data.assignments.filter((a) => {
      if (assignmentTab === "Archived") return a.archived;
      if (a.archived) return false;
      if (assignmentTab === "All") return true;
      const sub = isStaff
        ? data.submissions.some((s) => same(s.assignment_id, a.id))
        : !!submitted(a.id);
      const graded = data.scores.some(
        (s) => same(s.assessment_id, a.assessment_id) && s.published,
      );
      if (assignmentTab === "Submitted") return sub;
      if (assignmentTab === "Graded") return graded;
      const overdue = new Date(a.due_at) < new Date();
      return assignmentTab === "Overdue"
        ? overdue && !sub
        : !overdue && (!sub || isStaff);
    });
    return (
      <>
        <div className="sh-toolbar">
          <div className="sh-tabs">
            {[
              "Upcoming",
              "Overdue",
              "Submitted",
              "Graded",
              ...(isStaff ? ["All", "Archived"] : []),
            ].map((t) => (
              <button
                className={assignmentTab === t ? "active" : ""}
                key={t}
                onClick={() => setAssignmentTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {isStaff &&
            add("Create assignment", () =>
              edit(
                "assignments",
                "Create assignment",
                assessmentFields("assignments"),
              ),
            )}
        </div>
        <div className="sh-stack">
          {rows.map((a) => {
            const sub = submitted(a.id);
            return (
              <Card
                key={a.id}
                title={a.title}
                action={
                  <Badge>
                    {!a.published
                      ? "draft"
                      : new Date(a.due_at) < new Date()
                        ? "overdue"
                        : "upcoming"}
                  </Badge>
                }
              >
                <small>
                  {sectionLabel(a)} · {a.points} points · {a.weight}% weight
                </small>
                <p className="sh-prewrap">{a.instructions}</p>
                <Rubric
                  assignment={a}
                  submission={isStaff ? undefined : sub}
                  data={data}
                  edit={edit}
                  save={save}
                  isStaff={isStaff}
                />
                <p>
                  Due {stamp(a.due_at, zone)} ·{" "}
                  {a.allow_late
                    ? "Late submissions allowed"
                    : "Deadline enforced"}
                </p>
                {sub && (
                  <p className="sh-success">
                    Submitted {stamp(sub.submitted_at, zone)}
                  </p>
                )}
                <Files
                  files={data.files}
                  purpose="assignment"
                  assignmentId={a.id}
                  title="Assignment attachments"
                  canUpload={isStaff}
                  onChanged={load}
                />
                {sub && (
                  <Files
                    files={data.files}
                    purpose="submission"
                    submissionId={sub.id}
                    title="Submission attachments"
                    canUpload={
                      !isStaff &&
                      (a.allow_late || new Date(a.due_at) >= new Date())
                    }
                    onChanged={load}
                  />
                )}
                <div className="sh-actions">
                  {!isStaff ? (
                    <button
                      className="sh-primary"
                      disabled={
                        new Date(a.due_at) < new Date() && !a.allow_late
                      }
                      onClick={() =>
                        edit(
                          "submissions",
                          sub ? "Update submission" : "Submit assignment",
                          [field("content", "Your answer", "textarea")],
                          { assignment_id: a.id, content: sub?.content || "" },
                        )
                      }
                    >
                      {sub ? "View / update submission" : "Submit assignment"}
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        edit(
                          "assignments",
                          "Edit assignment",
                          assessmentFields("assignments"),
                          { ...a, due_at: new Date(a.due_at).toISOString() },
                        )
                      }
                    >
                      Edit assignment
                    </button>
                  )}
                </div>
                {isStaff && (
                  <>
                    <button
                      onClick={() =>
                        act("assessment_archive", {
                          id: a.assessment_id,
                          archived: !a.archived,
                        })
                      }
                    >
                      {a.archived ? "Restore assignment" : "Archive assignment"}
                    </button>
                    <details>
                      <summary>
                        Student submissions (
                        {
                          data.submissions.filter((s) =>
                            same(s.assignment_id, a.id),
                          ).length
                        }
                        )
                      </summary>
                      {data.submissions
                        .filter((s) => same(s.assignment_id, a.id))
                        .map((s) => (
                          <article className="sh-material" key={s.id}>
                            <b>{s.student_name}</b>
                            <Rubric
                              assignment={a}
                              submission={s}
                              data={data}
                              edit={edit}
                              save={save}
                              isStaff={isStaff}
                            />
                            <Files
                              files={data.files}
                              purpose="submission"
                              submissionId={s.id}
                              title="Submitted files"
                              onChanged={load}
                            />
                            <small>{stamp(s.submitted_at, zone)}</small>
                            <p className="sh-prewrap">{s.content}</p>
                            <button
                              onClick={() =>
                                edit(
                                  "scores",
                                  "Grade submission",
                                  [
                                    field("points", "Points earned", "number", {
                                      min: 0,
                                      max: a.points,
                                      step: 0.01,
                                    }),
                                    field("feedback", "Feedback", "textarea", {
                                      optional: true,
                                    }),
                                    field(
                                      "published",
                                      "Release grade",
                                      "checkbox",
                                    ),
                                  ],
                                  {
                                    assessment_id: a.assessment_id,
                                    student_id: s.student_id,
                                  },
                                )
                              }
                            >
                              Grade submission
                            </button>
                            <details>
                              <summary>Submission history</summary>
                              {data.submission_versions
                                .filter((v) => same(v.submission_id, s.id))
                                .map((v) => (
                                  <p className="sh-prewrap" key={v.id}>
                                    {stamp(v.submitted_at, zone)} — {v.content}
                                  </p>
                                ))}
                            </details>
                          </article>
                        ))}
                    </details>
                  </>
                )}
              </Card>
            );
          })}
        </div>
        {!rows.length && <Empty>No assignments in this view.</Empty>}
      </>
    );
  }
  function renderExams() {
    return (
      <>
        <div className="sh-toolbar">
          <p className="sh-muted">
            Exam schedules, instructions, and published results.
          </p>
          <div className="sh-actions">
            <button onClick={calendarExport}>Add to calendar</button>
            {isStaff &&
              add("Schedule exam", () =>
                edit("exams", "Schedule exam", assessmentFields("exams")),
              )}
          </div>
        </div>
        {data.exams.map((e) => (
          <Card
            key={e.id}
            title={e.title}
            action={
              <Badge>
                {!e.published
                  ? "draft"
                  : new Date(e.ends_at) < new Date()
                    ? "completed"
                    : "upcoming"}
              </Badge>
            }
          >
            <p>
              {sectionLabel(e)} · {e.points} points · {e.room_name}
            </p>
            <p>
              <b>{stamp(e.starts_at, zone)}</b> — {stamp(e.ends_at, zone)}
            </p>
            <p className="sh-prewrap">{e.instructions}</p>
            {isStaff && (
              <button
                onClick={() =>
                  edit("exams", "Edit exam", assessmentFields("exams"), {
                    ...e,
                    starts_at: new Date(e.starts_at).toISOString(),
                    ends_at: new Date(e.ends_at).toISOString(),
                  })
                }
              >
                Edit exam
              </button>
            )}
            <Link to="/grades">View results →</Link>
          </Card>
        ))}
        <Card title="Exam results">
          <Table
            rows={data.scores.filter((g) =>
              data.exams.some((e) => same(e.assessment_id, g.assessment_id)),
            )}
            columns={[
              col("title", "Exam"),
              ...(isStaff ? [col("student_name", "Student")] : []),
              col("points", "Score", (g) => `${g.points} / ${g.maximum}`),
              col("feedback", "Feedback"),
              col("published", "Status", (g) => (
                <Badge>{g.published ? "released" : "draft"}</Badge>
              )),
            ]}
          />
        </Card>
        {!data.exams.length && <Empty>No exams scheduled.</Empty>}
      </>
    );
  }
  function renderAnnouncements() {
    return (
      <>
        <div className="sh-toolbar">
          <label className="sh-search">
            <input
              aria-label="Search announcements"
              placeholder="Search announcements…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          {isStaff &&
            add("Post announcement", () =>
              edit("announcements", "Post announcement", [
                {
                  ...sectionOptions,
                  optional: isAdmin,
                  help: isAdmin
                    ? "Leave blank for a school-wide announcement."
                    : undefined,
                },
                field("title", "Title"),
                field("content", "Message", "textarea"),
                ...(isAdmin
                  ? [
                      {
                        ...options("audience_role", "Audience role", [
                          "student",
                          "teacher",
                          "admin",
                        ]),
                        optional: true,
                      },
                      select(
                        "program_id",
                        "Target program",
                        data.programs,
                        "name",
                        { optional: true },
                      ),
                    ]
                  : []),
                field("pinned", "Pin announcement", "checkbox"),
                field("publish_at", "Publish at", "datetime-local", {
                  optional: true,
                }),
                field("expires_at", "Expires at", "datetime-local", {
                  optional: true,
                }),
              ]),
            )}
        </div>
        {data.announcements
          .filter((a) =>
            `${a.title} ${a.content}`
              .toLowerCase()
              .includes(filter.toLowerCase()),
          )
          .map((a) => (
            <Card
              key={a.id}
              title={a.title}
              action={a.pinned && <Badge>Pinned</Badge>}
            >
              <small>
                {a.author_name} · {stamp(a.publish_at, zone)} ·{" "}
                {a.section_id ? sectionLabel(a) : "School-wide"}
              </small>
              <p className="sh-prewrap">{a.content}</p>
              <Files
                files={data.files}
                purpose="announcement"
                announcementId={a.id}
                title="Announcement attachments"
                canUpload={isAdmin || (isStaff && same(a.author_id, user.id))}
                onChanged={load}
              />
              {isStaff && (isAdmin || same(a.author_id, user.id)) && (
                <div className="sh-actions">
                  <button
                    onClick={() =>
                      edit(
                        "announcements",
                        "Edit announcement",
                        [
                          { ...sectionOptions, optional: isAdmin },
                          field("title", "Title"),
                          field("content", "Message", "textarea"),
                          ...(isAdmin
                            ? [
                                {
                                  ...options("audience_role", "Audience role", [
                                    "student",
                                    "teacher",
                                    "admin",
                                  ]),
                                  optional: true,
                                },
                                select(
                                  "program_id",
                                  "Target program",
                                  data.programs,
                                  "name",
                                  { optional: true },
                                ),
                              ]
                            : []),
                          field("pinned", "Pin announcement", "checkbox"),
                          field("publish_at", "Publish at", "datetime-local", {
                            optional: true,
                          }),
                          field("expires_at", "Expires at", "datetime-local", {
                            optional: true,
                          }),
                        ],
                        {
                          ...a,
                          publish_at: new Date(a.publish_at).toISOString(),
                          expires_at: a.expires_at
                            ? new Date(a.expires_at).toISOString()
                            : "",
                        },
                      )
                    }
                  >
                    Edit announcement
                  </button>
                  <button
                    onClick={() =>
                      act("announcements", {
                        ...a,
                        expires_at: new Date().toISOString(),
                        publish_at: new Date(
                          Math.min(
                            new Date(a.publish_at).getTime(),
                            Date.now() - 1000,
                          ),
                        ).toISOString(),
                      })
                    }
                  >
                    Archive announcement
                  </button>
                </div>
              )}
              {!a.read_at ? (
                <button onClick={() => act("announcement_reads", { id: a.id })}>
                  Mark as read
                </button>
              ) : (
                <Badge>Read</Badge>
              )}
            </Card>
          ))}
        {!data.announcements.length && <Empty>No announcements yet.</Empty>}
      </>
    );
  }
  function renderPeople(role) {
    const people = data.people.filter((p) => p.role === role);
    return (
      <>
        <PeopleTools data={data} edit={edit} load={load} role={role} />
        <div className="sh-stats">
          <Stat
            label={role === "student" ? "Total students" : "Total teachers"}
            value={people.length}
          />
          <Stat
            label="Active accounts"
            value={people.filter((p) => p.status === "active").length}
          />
          <Stat label="Programs" value={data.programs.length} />
        </div>
        <p className="sh-muted">
          New users sign up and verify their email first. Administrators can
          assign roles and official academic details below.
        </p>
        <Card
          title={role === "student" ? "Student directory" : "Teacher directory"}
        >
          <Table
            rows={people}
            columns={[
              col("name", "Name"),
              col("email", "Email"),
              ...(role === "student"
                ? [
                    col("student_number", "Student number"),
                    col("year_level", "Year"),
                  ]
                : []),
              col("status", "Status", (p) => <Badge>{p.status}</Badge>),
              col("actions", "Actions", (p) => (
                <button
                  onClick={() =>
                    edit(
                      "people",
                      "Manage account",
                      [
                        options("role", "Role", [
                          "student",
                          "teacher",
                          "admin",
                        ]),
                        options("status", "Status", ["active", "inactive"]),
                        field("student_number", "Student number", "text", {
                          optional: true,
                        }),
                        select("program_id", "Program", data.programs, "name", {
                          optional: true,
                        }),
                        field("year_level", "Year level", "number", {
                          min: 1,
                          max: 8,
                          optional: true,
                        }),
                      ],
                      p,
                    )
                  }
                >
                  Manage
                </button>
              )),
            ]}
            exportAction={exportButton(
              role === "student" ? "students" : "teachers",
              people,
            )}
          />
        </Card>
        {isAdmin && (
          <Card
            title="Enrollment"
            action={add("Manage enrollment", () =>
              edit("enrollments", "Enroll or withdraw student", [
                sectionOptions,
                studentsField,
                options("status", "Status", ["active", "withdrawn"]),
              ]),
            )}
          >
            <Table
              rows={data.enrollments}
              columns={[
                col("student_name", "Student"),
                col("section_id", "Class", sectionLabel),
                col("status", "Status", (r) => <Badge>{r.status}</Badge>),
              ]}
            />
          </Card>
        )}
      </>
    );
  }
  function renderSettings() {
    return (
      <>
        <div className="sh-grid">
          <Card
            title="Preferences"
            action={
              <button
                onClick={() =>
                  edit(
                    "preferences",
                    "Your preferences",
                    [
                      field("timezone", "Timezone", "text", {
                        help: "For example: Asia/Manila",
                      }),
                      options("theme", "Appearance", ["light", "dark"]),
                      field(
                        "notify_assignments",
                        "Assignment notifications",
                        "checkbox",
                      ),
                      field(
                        "notify_announcements",
                        "Announcement notifications",
                        "checkbox",
                      ),
                      field("notify_grades", "Grade notifications", "checkbox"),
                    ],
                    {
                      timezone: zone,
                      theme: darkMode ? "dark" : "light",
                      notify_assignments: profile.notify_assignments ?? true,
                      notify_announcements:
                        profile.notify_announcements ?? true,
                      notify_grades: profile.notify_grades ?? true,
                    },
                  )
                }
              >
                Edit preferences
              </button>
            }
          >
            <dl>
              <dt>Timezone</dt>
              <dd>{zone}</dd>
              <dt>Language</dt>
              <dd>English</dd>
              <dt>Appearance</dt>
              <dd>{darkMode ? "Dark" : "Light"}</dd>
            </dl>
            <button onClick={toggleAppearance}>
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}Switch
              appearance
            </button>
          </Card>
          <Card title="Account & security">
            <p>
              {user.auth_provider === "google"
                ? "You sign in with Google. Manage your password in your Google account."
                : "Keep your password private and unique."}
            </p>
            {user.auth_provider === "local" && (
              <button
                onClick={() =>
                  setDialog({
                    title: "Change password",
                    fields: [
                      field("current_password", "Current password", "password"),
                      field("password", "New password", "password", {
                        maxLength: 72,
                      }),
                    ],
                    initial: {},
                    onSave: async (values) => {
                      await schoolRequest("password", values);
                      navigate("/");
                    },
                  })
                }
              >
                Change password
              </button>
            )}
            <h3>Google sign-in</h3>
            {user.google_linked ? (
              <>
                <p>Google account connected.</p>
                {user.auth_provider === "local" && (
                  <button
                    onClick={() =>
                      edit("unlink_google", "Unlink Google", [
                        field(
                          "current_password",
                          "Confirm your password",
                          "password",
                        ),
                      ])
                    }
                  >
                    Unlink Google
                  </button>
                )}
              </>
            ) : import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
              <GoogleLogin
                onSuccess={async (response) => {
                  try {
                    const res = await fetch("/api/link-google", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ credential: response.credential }),
                    });
                    const result = await res.json();
                    if (!res.ok) throw new Error(result.message);
                    await load();
                    setNotice("Google account linked.");
                  } catch (e) {
                    setError(e.message);
                  }
                }}
                onError={() => setError("Google account linking failed.")}
              />
            ) : (
              <p>Google sign-in is not configured.</p>
            )}
            <h3>Active sessions</h3>
            {data.sessions.map((s) => (
              <div className="sh-list-item" key={s.id}>
                <span>Expires {stamp(s.expires_at, zone)}</span>
                <button onClick={() => act("sessions", { id: s.id })}>
                  Revoke
                </button>
              </div>
            ))}
          </Card>
        </div>
        {isAdmin && (
          <>
            <Card
              title="School policies"
              action={
                <button
                  onClick={() =>
                    edit(
                      "school_settings",
                      "School settings",
                      [
                        field("name", "School name"),
                        field("timezone", "School timezone"),
                        field(
                          "attendance_threshold",
                          "Attendance threshold (%)",
                          "number",
                          { min: 0, max: 100 },
                        ),
                      ],
                      school,
                    )
                  }
                >
                  Edit school settings
                </button>
              }
            >
              <dl>
                <dt>Name</dt>
                <dd>{school.name}</dd>
                <dt>Timezone</dt>
                <dd>{school.timezone}</dd>
                <dt>Attendance threshold</dt>
                <dd>{school.attendance_threshold}%</dd>
              </dl>
            </Card>
            <Card title="Account administration">
              <Table
                rows={data.people}
                columns={[
                  col("name", "Name"),
                  col("email", "Email"),
                  col("role", "Role"),
                  col("status", "Status"),
                  col("actions", "Actions", (p) => (
                    <button
                      onClick={() =>
                        edit(
                          "people",
                          "Manage account",
                          [
                            options("role", "Role", [
                              "student",
                              "teacher",
                              "admin",
                            ]),
                            options("status", "Status", ["active", "inactive"]),
                          ],
                          p,
                        )
                      }
                    >
                      Manage
                    </button>
                  )),
                ]}
              />
            </Card>
            <Card title="Service configuration">
              <Table
                search={false}
                rows={Object.entries(data.services || {}).map(
                  ([name, ready]) => ({ name, ready }),
                )}
                columns={[
                  col("name", "Service"),
                  col("ready", "Configuration", (r) => (
                    <Badge>{r.ready ? "configured" : "setup needed"}</Badge>
                  )),
                ]}
              />
              <small>
                Configuration presence is separate from a successful delivery
                test.
              </small>
            </Card>
            <Card
              title="Email delivery queue"
              action={
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/jobs", { method: "POST" });
                      const result = await res.json();
                      if (!res.ok) throw new Error(result.message);
                      await load();
                      setNotice(
                        `Email queue: ${result.sent} sent, ${result.failed} failed.`,
                      );
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Process queue
                </button>
              }
            >
              <Table
                rows={data.email_jobs}
                columns={[
                  col("subject", "Subject"),
                  col("state", "State"),
                  col("attempts", "Attempts"),
                  col("next_attempt_at", "Next attempt"),
                  col("actions", "Actions", (job) =>
                    job.state === "failed" ? (
                      <button
                        onClick={() => act("retry_email", { id: job.id })}
                      >
                        Retry delivery
                      </button>
                    ) : null,
                  ),
                ]}
              />
            </Card>
            <Card title="Recent audit history">
              <Table
                rows={data.audit_logs}
                columns={[
                  col("created_at", "When", (a) => stamp(a.created_at, zone)),
                  col("actor_name", "Actor"),
                  col("action", "Action"),
                  col("entity", "Record type"),
                  col("entity_id", "Record ID"),
                ]}
              />
            </Card>
          </>
        )}
      </>
    );
  }
  function renderHelp() {
    return (
      <Help
        name={user.name}
        email={user.email}
        articles={data.help_articles}
        files={data.files.filter((f) => same(f.owner_id, user.id))}
        onChanged={load}
        isAdmin={isAdmin}
        edit={edit}
      />
    );
  }
  return (
    <div className="sh-app">
      <button
        className="sh-mobile-menu"
        onClick={() => setMenu(!menu)}
        aria-label="Toggle navigation"
        aria-expanded={menu}
      >
        <Menu />
      </button>
      {menu && (
        <button
          className="sh-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sh-sidebar ${menu ? "open" : ""}`} onClick={(event) => {
        if (event.target.closest("a")) {
          setMenu(false);
          setBells(false);
          setDialog(null);
          setError("");
          setNotice("");
        }
      }}>
        <Link className="sh-brand" to="/dashboard">
          <img src="/school-hub.svg" alt="" />
          School Hub
        </Link>
        <nav>
          {navigation
            .filter(([group]) => group !== "ADMINISTRATION" || isAdmin)
            .map(([group, items]) => (
              <div key={group}>
                <span className="sh-nav-label">{group}</span>
                {items.map(([name, path, Icon]) => (
                  <Link
                    aria-current={page === path ? "page" : undefined}
                    to={`/${path}`}
                    key={path}
                  >
                    <Icon size={19} />
                    {name}
                  </Link>
                ))}
              </div>
            ))}
        </nav>
        <div className="sh-sidebar-bottom">
          <Link
            to="/settings"
            aria-current={page === "settings" ? "page" : undefined}
          >
            <Settings size={19} />
            Settings
          </Link>
          <Link to="/help" aria-current={page === "help" ? "page" : undefined}>
            <HelpCircle size={19} />
            Help & Support
          </Link>
          <div className="sh-user">
            <div className="sh-avatar">{avatarContent}</div>
            <span>
              {user.name}
              <small>{user.role}</small>
            </span>
            <button aria-label="Log out" onClick={logout}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="sh-workspace">
        <header className="sh-topbar">
          <select
            className="sh-term-select"
            aria-label="Academic term"
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
          >
            <option value="all">All terms</option>
            {allData.terms.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <span>
            School Hub <span className="sh-muted">/ {title}</span>
          </span>
          <div className="sh-actions">
            <button aria-label="Toggle theme" onClick={toggleAppearance}>
              {darkMode ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              aria-label="Notifications"
              className="sh-bell"
              onClick={() => setBells(!bells)}
            >
              <Bell size={20} />
              {data.notifications.some((n) => !n.read_at) && <i />}
            </button>
            <Link to="/profile" className="sh-avatar" aria-label="Your profile">
              {avatarContent}
            </Link>
          </div>
        </header>
        {bells && (
          <div className="sh-notification-panel">
            <h2>Notifications</h2>
            <button onClick={() => act("notifications", {})}>
              Mark all read
            </button>
            {data.notifications.map((n) => (
              <Link
                key={n.id}
                to={n.href}
                onClick={() => {
                  act("notifications", { id: n.id });
                  setBells(false);
                }}
                className="sh-list-item"
              >
                <span>
                  {n.title}
                  <small>{stamp(n.created_at, zone)}</small>
                </span>
                {!n.read_at && <Badge>New</Badge>}
              </Link>
            ))}
            {!data.notifications.length && <Empty>No notifications yet.</Empty>}
          </div>
        )}
        <main className="sh-main">
          <div className="sh-page-heading">
            <div>
              <h1>{title}</h1>
              <p>
                {
                  {
                    dashboard: "Your school day, at a glance.",
                    profile: "Your personal and academic information.",
                    courses: "Explore your classes and learning resources.",
                    schedule: "Stay on top of your week.",
                    grades: "Understand your academic progress.",
                    attendance: "Every class counts.",
                    assignments: "Your coursework, organized.",
                    exams: "Prepare for what’s next.",
                    announcements: "The latest from your school.",
                    students: "Manage student records and enrollment.",
                    teachers: "Manage faculty and teaching access.",
                    settings: "Make School Hub work for you.",
                    help: "Answers and support when you need them.",
                  }[page]
                }
              </p>
            </div>
          </div>
          {error && (
            <div role="alert" className="sh-error">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <p role="status" className="sh-success">
              {notice}
            </p>
          )}
          {{
            dashboard: renderDashboard,
            profile: renderProfile,
            courses: renderCourses,
            schedule: renderSchedule,
            grades: renderGrades,
            attendance: renderAttendance,
            assignments: renderAssignments,
            exams: renderExams,
            announcements: renderAnnouncements,
            students: () => renderPeople("student"),
            teachers: () => renderPeople("teacher"),
            settings: renderSettings,
            help: renderHelp,
          }[page]()}
        </main>
      </div>
      {dialog && (
        <FormDialog
          key={dialog.title}
          {...dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
function ProfileInformation({ user, profile, onSave, emergency = false }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = emergency ? "Emergency contact" : "Personal information";
  const editLabel = emergency ? "Edit emergency contact" : "Edit profile";
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      await onSave({ ...profile, name: user.name, ...values });
      setEditing(false);
    } catch (e) {
      setError(e.message || "Unable to save your details. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={title} action={!editing && (
      <button className="sh-primary" onClick={() => { setError(""); setEditing(true); }}>
        {editLabel}
      </button>
    )}>
      {editing ? (
        <form className="sh-form" aria-label={`Edit ${title.toLowerCase()}`} onSubmit={submit}>
          {emergency ? (
            <>
              <label>Emergency contact name (optional)<input name="emergency_name" defaultValue={profile.emergency_name || ""} maxLength={120} /></label>
              <label>Emergency contact phone (optional)<input name="emergency_phone" type="tel" defaultValue={profile.emergency_phone || ""} maxLength={60} /></label>
            </>
          ) : (
            <>
              <label>Full name<input name="name" defaultValue={user.name} required maxLength={120} autoComplete="name" /></label>
              <label>Email address<input type="email" value={user.email} readOnly autoComplete="email" /></label>
              <label>Phone (optional)<input name="phone" type="tel" defaultValue={profile.phone || ""} maxLength={60} autoComplete="tel" /></label>
              <label>Address (optional)<textarea name="address" defaultValue={profile.address || ""} maxLength={500} autoComplete="street-address" /></label>
            </>
          )}
          {error && <p role="alert" className="sh-error">{error}</p>}
          <div className="sh-actions">
            <button className="sh-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
            <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Cancel</button>
          </div>
        </form>
      ) : emergency ? (
        <dl>
          <dt>Name</dt><dd>{profile.emergency_name || "Not provided"}</dd>
          <dt>Phone</dt><dd>{profile.emergency_phone || "Not provided"}</dd>
        </dl>
      ) : (
        <dl>
          <dt>Full name</dt><dd>{user.name}</dd>
          <dt>Email address</dt><dd>{user.email}</dd>
          <dt>Phone</dt><dd>{profile.phone || "Not provided"}</dd>
          <dt>Address</dt><dd>{profile.address || "Not provided"}</dd>
        </dl>
      )}
    </Card>
  );
}
function AcademicSetup({ data, edit }) {
  const [tab, setTab] = useState("courses");
  const definitions = {
    academic_years: [
      field("name", "Academic year"),
      field("starts_on", "Start date", "date"),
      field("ends_on", "End date", "date"),
    ],
    departments: [field("name", "Department name")],
    programs: [
      field("name", "Program name"),
      select("department_id", "Department", data.departments, "name", {
        optional: true,
      }),
    ],
    terms: [
      select("academic_year_id", "Academic year", data.academic_years, "name", {
        optional: true,
      }),
      field("name", "Term name"),
      field("starts_on", "Start date", "date"),
      field("ends_on", "End date", "date"),
    ],
    rooms: [
      field("name", "Room name"),
      field("capacity", "Capacity", "number", { min: 1, max: 10000 }),
    ],
    courses: [
      field("code", "Course code"),
      field("name", "Course name"),
      field("credits", "Credits", "number", { min: 0.1, max: 30, step: 0.1 }),
      field("description", "Description", "textarea", { optional: true }),
      select("department_id", "Department", data.departments, "name", {
        optional: true,
      }),
    ],
  };
  return (
    <Card
      title="Academic setup"
      action={
        <button
          onClick={() =>
            edit(tab, `Add ${tab.replace(/s$/, "")}`, definitions[tab])
          }
        >
          <Plus size={16} />
          Add record
        </button>
      }
    >
      <div className="sh-tabs">
        {Object.keys(definitions).map((t) => (
          <button
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      <Table
        key={tab}
        rows={data[tab]}
        columns={[
          col("name", "Name"),
          col("actions", "Actions", (r) => (
            <div className="sh-actions">
              <button
                onClick={() =>
                  edit(
                    "catalog_update",
                    "Edit academic record",
                    definitions[tab],
                    {
                      ...r,
                      table: tab,
                      starts_on: day(r.starts_on),
                      ends_on: day(r.ends_on),
                    },
                  )
                }
              >
                Edit
              </button>
              <button
                onClick={() =>
                  edit("catalog_delete", "Delete unused record", [], {
                    id: r.id,
                    table: tab,
                  })
                }
              >
                Delete
              </button>
            </div>
          )),
          ...(tab === "courses"
            ? [col("code", "Code"), col("credits", "Credits")]
            : tab === "terms"
              ? [
                  col("starts_on", "Start", (r) => day(r.starts_on)),
                  col("ends_on", "End", (r) => day(r.ends_on)),
                ]
              : tab === "rooms"
                ? [col("capacity", "Capacity")]
                : []),
        ]}
      />
      <h3>Program curriculum</h3>
      <button
        onClick={() =>
          edit("program_courses", "Assign course to program", [
            select("program_id", "Program", data.programs),
            select("course_id", "Course", data.courses),
            field("year_level", "Year level", "number", { min: 1, max: 8 }),
          ])
        }
      >
        Add curriculum course
      </button>
      <Table
        rows={data.program_courses}
        columns={[
          col(
            "program_id",
            "Program",
            (r) => data.programs.find((p) => same(p.id, r.program_id))?.name,
          ),
          col(
            "course_id",
            "Course",
            (r) => data.courses.find((c) => same(c.id, r.course_id))?.name,
          ),
          col("year_level", "Year"),
        ]}
      />
    </Card>
  );
}
function Help({ name, email, articles, isAdmin, edit, files, onChanged }) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const faqs = articles.map((a) => [a.title, a.content]);
  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(
        import.meta.env.VITE_FORMSPREE_ENDPOINT ||
          "https://formspree.io/f/xgaawjzg",
        {
          method: "POST",
          body: new FormData(e.currentTarget),
          headers: { Accept: "application/json" },
        },
      );
      if (!res.ok) throw new Error("Message could not be sent. Please retry.");
      setStatus("Your message was sent. Our team will reply by email.");
      e.target.reset();
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="sh-welcome">
        <div>
          <h2>How can we help?</h2>
          <p>Find an answer or reach out to our support team.</p>
        </div>
        <HelpCircle size={70} />
      </div>
      <label className="sh-search">
        <input
          aria-label="Search help articles"
          placeholder="Search help articles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="sh-grid">
        <Card title="Contact support">
          <form className="sh-form" onSubmit={send}>
            <label>
              Name
              <input name="name" defaultValue={name} required maxLength={120} />
            </label>
            <label>
              Email
              <input name="email" type="email" defaultValue={email} required />
            </label>
            <label>
              Category
              <select name="category" required>
                <option>Account access</option>
                <option>Courses & grades</option>
                <option>Technical support</option>
              </select>
            </label>
            <label>
              Subject
              <input name="subject" required maxLength={200} />
            </label>
            <label>
              Message
              <textarea name="message" required maxLength={5000} rows={5} />
            </label>
            <Files
              files={files}
              purpose="document"
              title="Supporting documents"
              canUpload
              onChanged={onChanged}
            />
            {files
              .filter((f) => f.purpose === "document")
              .map((f) => (
                <label className="sh-check" key={f.id}>
                  <input
                    type="checkbox"
                    name="attachments"
                    value={`${window.location.origin}/api/file?id=${f.id}`}
                  />
                  Attach {f.name}
                </label>
              ))}
            <button className="sh-primary" disabled={busy}>
              {busy ? "Sending…" : "Send message"}
            </button>
            {status && <p role="status">{status}</p>}
          </form>
        </Card>
        <Card
          title="Frequently asked questions"
          action={
            isAdmin && (
              <button
                onClick={() =>
                  edit(
                    "help_articles",
                    "Add help article",
                    [
                      field("title", "Title"),
                      field("content", "Answer", "textarea"),
                      field("category", "Category"),
                      field("published", "Publish article", "checkbox"),
                    ],
                    { published: true },
                  )
                }
              >
                Add article
              </button>
            )
          }
        >
          {faqs
            .filter((f) =>
              f.join(" ").toLowerCase().includes(search.toLowerCase()),
            )
            .map(([q, a]) => (
              <details className="sh-faq" key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
                {isAdmin && (
                  <button
                    onClick={() => {
                      const article = articles.find((item) => item.title === q);
                      edit(
                        "help_articles",
                        "Edit help article",
                        [
                          field("title", "Title"),
                          field("content", "Answer", "textarea"),
                          field("category", "Category"),
                          field("published", "Publish article", "checkbox"),
                        ],
                        article,
                      );
                    }}
                  >
                    Edit article
                  </button>
                )}
              </details>
            ))}
        </Card>
      </div>
    </>
  );
}
