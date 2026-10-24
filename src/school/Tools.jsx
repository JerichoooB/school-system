import { useRef, useState } from "react";
import { Card, Table, Badge, EditableSection } from "./ui";
import { schoolRequest } from "./api";
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
const choice = (key, label, values) =>
  field(key, label, "text", {
    options: values.map((v) => ({ value: v, label: v })),
  });
const col = (key, label, render) => ({ key, label, render });
export function GradeTools({ data, edit, isStaff, sectionLabel, onSave }) {
  const policy =
    data.school_settings.find((s) => s.key === "grading")?.value || {};
  const sections = data.sections
    .filter((s) => !s.archived)
    .map((s) => ({ ...s, name: `${s.code} · ${s.name}` }));
  return (
    <>
      <Card
        title="Final grades"
        action={
          isStaff && (
            <button
              className="sh-primary"
              onClick={() =>
                edit("final_grades", "Finalize course grade", [
                  select("section_id", "Class", sections),
                  select(
                    "student_id",
                    "Student",
                    data.people.filter((p) => p.role === "student"),
                  ),
                  field("published", "Publish final grade", "checkbox"),
                ])
              }
            >
              Calculate final grade
            </button>
          )
        }
      >
        <p className="sh-muted">
          Final grades require complete assessment weights and scores, or
          explicit exemptions. GPA follows the administrator’s grading scale.
        </p>
        <Table
          rows={data.final_grades}
          columns={[
            col("section_id", "Class", sectionLabel),
            ...(isStaff ? [col("student_name", "Student")] : []),
            col("percentage", "Final percentage"),
            col("letter", "Grade"),
            col("gpa", "GPA"),
            col("published", "Status", (g) => (
              <Badge>{g.published ? "published" : "draft"}</Badge>
            )),
          ]}
        />
      </Card>
      {isStaff && (
        <Card
          title="Grading categories"
          action={
            <button
              onClick={() =>
                edit("assessment_categories", "Add grading category", [
                  select("section_id", "Class", sections),
                  field("name", "Category name"),
                  field("weight", "Category weight (%)", "number", {
                    min: 0.01,
                    max: 100,
                    step: 0.01,
                  }),
                ])
              }
            >
              Add category
            </button>
          }
        >
          <p className="sh-muted">
            Optional categories, such as Coursework 40% and Exams 60%. Within
            each category, assessment weights must total 100% before
            finalization.
          </p>
          <Table
            rows={data.assessment_categories}
            columns={[
              col("name", "Name"),
              col("section_id", "Class", sectionLabel),
              col("weight", "Weight (%)"),
            ]}
          />
        </Card>
      )}
      <EditableSection title="School grading scale" label="Edit grading policy"
        canEdit={data.user.role === "admin"}
        fields={[
          field("bands", "Grade bands (JSON)", "textarea", {help:'Example: [{"minimum":90,"letter":"A","gpa":4},{"minimum":0,"letter":"F","gpa":0}]'}),
          field("late_penalty_percent", "Late penalty (% of maximum points)", "number", {min:0,max:100}),
          field("missing_as_zero", "Treat unscored assessments as zero at finalization", "checkbox"),
          field("late_counts_present", "Late counts as attended", "checkbox"),
          field("exclude_excused", "Exclude excused attendance from percentages", "checkbox"),
        ]}
        initial={{...policy,bands:JSON.stringify(policy.bands,null,2)}}
        onSave={(values) => onSave("grading_policy",values)}
      >
        <Table
          rows={policy.bands || []}
          search={false}
          columns={[
            col("minimum", "Minimum %"),
            col("letter", "Grade"),
            col("gpa", "GPA"),
          ]}
        />
      </EditableSection>
      {isStaff && (
        <Card title="Grade change history">
          <Table
            rows={data.grade_history}
            columns={[
              col("created_at", "Changed at", (r) =>
                new Date(r.created_at).toLocaleString(),
              ),
              col(
                "student_id",
                "Student",
                (r) =>
                  data.people.find((p) => String(p.id) === String(r.student_id))
                    ?.name || r.student_id,
              ),
              col(
                "assessment_id",
                "Assessment",
                (r) =>
                  data.assessments.find(
                    (a) => String(a.id) === String(r.assessment_id),
                  )?.title || r.assessment_id,
              ),
              col("reason", "Reason"),
              col("after_value", "New score", (r) => r.after_value.points),
            ]}
          />
        </Card>
      )}
    </>
  );
}
export function Rubric({ assignment, submission, data, edit, save, isStaff }) {
  const criteria = data.rubrics.filter(
    (r) => String(r.assignment_id) === String(assignment.id),
  );
  return (
    <details className="sh-faq">
      <summary>Grading rubric ({criteria.length} criteria)</summary>
      {criteria.map((c) => (
        <p key={c.id}>
          {c.title} <Badge>{c.maximum} points</Badge>
          {submission &&
            data.rubric_scores.some(
              (g) =>
                String(g.criterion_id) === String(c.id) &&
                String(g.submission_id) === String(submission.id),
            ) && (
              <Badge>
                Earned:{" "}
                {
                  data.rubric_scores.find(
                    (g) =>
                      String(g.criterion_id) === String(c.id) &&
                      String(g.submission_id) === String(submission.id),
                  ).points
                }
              </Badge>
            )}
        </p>
      ))}
      {isStaff && (
        <button
          onClick={() =>
            edit(
              "rubrics",
              "Add rubric criterion",
              [
                field("title", "Criterion"),
                field("maximum", "Maximum points", "number", {
                  min: 0.01,
                  step: 0.01,
                }),
              ],
              { assignment_id: assignment.id },
            )
          }
        >
          Add criterion
        </button>
      )}
      {isStaff && submission && criteria.length > 0 && (
        <RubricForm
          criteria={criteria}
          submission={submission}
          data={data}
          save={save}
        />
      )}
    </details>
  );
}
function RubricForm({ criteria, submission, data, save }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await save("rubric_scores", {
        submission_id: submission.id,
        criteria: criteria.map((c) => ({
          id: c.id,
          points: Number(form.get(`score-${c.id}`)),
        })),
        feedback: form.get("feedback"),
        published: form.get("published") === "on",
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="sh-form">
      {criteria.map((c) => (
        <label key={c.id}>
          {c.title} / {c.maximum}
          <input
            name={`score-${c.id}`}
            type="number"
            min="0"
            max={c.maximum}
            step=".01"
            required
            defaultValue={
              data.rubric_scores.find(
                (s) =>
                  String(s.criterion_id) === String(c.id) &&
                  String(s.submission_id) === String(submission.id),
              )?.points || 0
            }
          />
        </label>
      ))}
      <label>
        Feedback
        <textarea name="feedback" />
      </label>
      <label className="sh-check">
        <input type="checkbox" name="published" />
        Release grade
      </label>
      <button disabled={busy}>{busy ? "Saving…" : "Save rubric scores"}</button>
      {error && (
        <p role="alert" className="sh-error">
          {error}
        </p>
      )}
    </form>
  );
}
export function PeopleTools({ data, edit, load, role }) {
  const input = useRef(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function importFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const rows = parseCSV(await file.text());
      const res = await schoolRequest("import_people", { rows });
      await load();
      setError(`Imported ${res.record.imported} records.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      input.current.value = "";
    }
  }
  return (
    <>
      <EditableSection title={role === "teacher" ? "Invite a new teacher" : "Invite a new student"}
        label={`Invite ${role}`} submitLabel="Send invitation"
        fields={[field("name", "Full name", "text", {optional:true,maxLength:120}),field("email", "Email address", "email")]}
        initial={{role}}
        onSave={async (values) => { await schoolRequest("invitations", {...values,role}); await load(); }}
      >
        <p>Enter their email to send a secure invitation. They will set up or sign in to their own account and accept the {role} role. Invitations expire after seven days.</p>
        <p className="sh-muted">Full name is optional and personalizes the invitation. The recipient confirms their account details when signing up.</p>
        <Table rows={data.invitations.filter(i => i.role === role)} columns={[
          col("email", "Invitation email"),
          col("expires_at", "Expires", r => new Date(r.expires_at).toLocaleDateString()),
          col("accepted_at", "Status", r => <Badge>{r.accepted_at ? "accepted" : new Date(r.expires_at)<new Date() ? "expired" : "pending"}</Badge>),
        ]} />
      </EditableSection>
      <Card title="Update existing accounts from CSV">
        <div className="sh-actions">
          <button disabled={busy} onClick={() => input.current.click()}>
            {busy ? "Importing…" : "Import CSV"}
          </button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sh-file-input"
            aria-label="Import account CSV"
            onChange={importFile}
          />
        </div>
        <p className="sh-muted">
          CSV columns: email, name, role, student_number, program_id,
          year_level. Up to 100 existing accounts per batch. All rows are
          validated together; a failed import changes nothing.
        </p>
        {error && <p role="status">{error}</p>}
      </Card>
      {role === "teacher" && (
        <Card
          title="Assign existing teachers to departments"
          action={
            <button
              onClick={() =>
                edit("teacher_departments", "Assign teacher department", [
                  select(
                    "teacher_id",
                    "Teacher",
                    data.people.filter((p) => p.role === "teacher"),
                  ),
                  select("department_id", "Department", data.departments),
                ])
              }
            >
              Assign teacher department
            </button>
          }
        >
          <Table
            rows={data.teacher_departments}
            columns={[
              col(
                "teacher_id",
                "Teacher",
                (r) =>
                  data.people.find((p) => String(p.id) === String(r.teacher_id))
                    ?.name,
              ),
              col(
                "department_id",
                "Department",
                (r) =>
                  data.departments.find(
                    (p) => String(p.id) === String(r.department_id),
                  )?.name,
              ),
            ]}
          />
        </Card>
      )}
    </>
  );
}
function parseCSV(raw) {
  if (raw.length > 500000) throw new Error("CSV file is too large.");
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  raw = raw.replace(/^\uFEFF/, "");
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (quoted && raw[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  const headers = rows.shift()?.map((v) => v.trim());
  if (!headers?.includes("email") || !headers.includes("name"))
    throw new Error("CSV needs email and name columns.");
  return rows.map((values, i) => {
    if (values.length !== headers.length)
      throw new Error(`CSV row ${i + 2} has an incorrect column count.`);
    return Object.fromEntries(headers.map((k, j) => [k, values[j].trim()]));
  });
}
export function OfficeHours({ data, edit, save }) {
  const staff = data.user.role !== "student";
  return (
    <Card
      title="Faculty office hours"
      action={
        staff && (
          <button
            onClick={() =>
              edit("office_hours", "Add office hours", [
                ...(data.user.role === "admin"
                  ? [
                      select(
                        "teacher_id",
                        "Teacher",
                        data.people.filter((p) => p.role === "teacher"),
                      ),
                    ]
                  : []),
                field("weekday", "Weekday (Monday = 1)", "number", {
                  min: 1,
                  max: 7,
                }),
                field("starts_at", "Start time", "time"),
                field("ends_at", "End time", "time"),
                field("location", "Office / location"),
              ])
            }
          >
            Add office hours
          </button>
        )
      }
    >
      <Table
        rows={data.office_hours}
        columns={[
          col(
            "teacher_id",
            "Teacher",
            (r) =>
              data.faculty.find((p) => String(p.id) === String(r.teacher_id))
                ?.name ||
              data.people.find((p) => String(p.id) === String(r.teacher_id))
                ?.name ||
              data.user.name,
          ),
          col(
            "weekday",
            "Day",
            (r) =>
              [
                "",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
              ][r.weekday],
          ),
          col("starts_at", "Start"),
          col("ends_at", "End"),
          col("location", "Location"),
          ...(staff
            ? [
                col("actions", "Actions", (r) => (
                  <button
                    onClick={() =>
                      save("office_hours", {
                        id: r.id,
                        teacher_id: r.teacher_id,
                        remove: true,
                      })
                    }
                  >
                    Remove
                  </button>
                )),
              ]
            : []),
        ]}
      />
    </Card>
  );
}
export function ScheduleChanges({ data, edit, save, sectionLabel }) {
  return (
    <Card
      title="Holidays, events & class changes"
      action={
        data.user.role !== "student" && (
          <button
            onClick={() =>
              edit("schedule_exceptions", "Add calendar change", [
                select(
                  "section_id",
                  "Class",
                  data.sections.map((s) => ({
                    ...s,
                    name: `${s.code} · ${s.name}`,
                  })),
                  "name",
                  { optional: data.user.role === "admin" },
                ),
                choice("kind", "Type", [
                  "holiday",
                  "cancellation",
                  "event",
                  "rescheduled",
                ]),
                field("title", "Title"),
                field("starts_at", "Starts at", "datetime-local"),
                field("ends_at", "Ends at", "datetime-local"),
                select("room_id", "Room", data.rooms, "name", {
                  optional: true,
                }),
              ])
            }
          >
            Add calendar change
          </button>
        )
      }
    >
      <Table
        rows={data.schedule_exceptions}
        columns={[
          col("title", "Title"),
          col("kind", "Type"),
          col("section_id", "Class", (r) =>
            r.section_id ? sectionLabel(r) : "School-wide",
          ),
          col("starts_at", "Starts", (r) =>
            new Date(r.starts_at).toLocaleString(),
          ),
          col("ends_at", "Ends", (r) => new Date(r.ends_at).toLocaleString()),
          ...(data.user.role !== "student"
            ? [
                col("actions", "Actions", (r) => (
                  <button
                    onClick={() =>
                      save("content_delete", {
                        id: r.id,
                        table: "schedule_exceptions",
                      })
                    }
                  >
                    Remove
                  </button>
                )),
              ]
            : []),
        ]}
      />
    </Card>
  );
}
