import { useState } from "react";
import { Card, Badge, Table } from "./ui";
export default function AttendanceCalendar({ data, sectionLabel, policy }) {
  const [month, setMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [section, setSection] = useState("all");
  const records = data.attendance.filter(
      (a) => section === "all" || String(a.section_id) === section,
    ),
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    offset = (month.getDay() + 6) % 7;
  const summaries = data.sections
    .map((s) => {
      const rows = records.filter(
        (a) =>
          String(a.section_id) === String(s.id) &&
          !data.class_sessions.find(
            (cs) => String(cs.id) === String(a.session_id),
          )?.cancelled &&
          (!policy.exclude_excused || a.status !== "excused"),
      );
      return {
        id: s.id,
        course: `${s.code} · ${s.name}`,
        marked: rows.length,
        present: rows.filter(
          (a) =>
            a.status === "present" ||
            (policy.late_counts_present !== false && a.status === "late"),
        ).length,
      };
    })
    .filter((r) => r.marked);
  return (
    <>
      <Card
        title="Attendance calendar"
        action={
          <div className="sh-actions">
            <select
              aria-label="Filter attendance by course"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="all">All courses</option>
              {data.sections.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
            <button
              aria-label="Previous attendance month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              ←
            </button>
            <span>
              {month.toLocaleDateString("en", {
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              aria-label="Next attendance month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              →
            </button>
          </div>
        }
      >
        <div className="sh-month-scroll">
          <div className="sh-month">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <b key={d}>{d}</b>
            ))}
            {Array.from({ length: offset + days }, (_, i) => {
              if (i < offset)
                return <div className="sh-month-day blank" key={i} />;
              const d = new Date(
                  month.getFullYear(),
                  month.getMonth(),
                  i - offset + 1,
                ),
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return (
                <div className="sh-month-day" key={i}>
                  <strong>{d.getDate()}</strong>
                  {records
                    .filter((a) => String(a.held_on).slice(0, 10) === key)
                    .map((a) => (
                      <div key={a.id}>
                        <small>{sectionLabel(a)}</small>{" "}
                        <Badge>{a.status}</Badge>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      <Card title="Attendance by course">
        <Table
          rows={summaries}
          columns={[
            { key: "course", label: "Course" },
            { key: "present", label: "Attended" },
            { key: "marked", label: "Marked sessions" },
            {
              key: "rate",
              label: "Attendance rate",
              render: (r) => `${((r.present / r.marked) * 100).toFixed(1)}%`,
            },
          ]}
        />
      </Card>
    </>
  );
}
