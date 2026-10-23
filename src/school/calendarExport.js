import { download } from "./api";
const esc = (value) =>
  String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;")
    .replaceAll("\r", "");
const utc = (value) =>
  new Date(value)
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}/, "");
export function exportCalendar(data, timezone) {
  const events = [],
    now = utc(new Date());
  for (const m of data.meetings) {
    const section = data.sections.find(
      (s) => String(s.id) === String(m.section_id),
    );
    if (section?.archived) continue;
    const term = data.terms.find(
      (t) => String(t.id) === String(section?.term_id),
    );
    if (!term) continue;
    const first = new Date(String(term.starts_on).slice(0, 10) + "T00:00:00Z");
    while (((first.getUTCDay() + 6) % 7) + 1 !== m.weekday)
      first.setUTCDate(first.getUTCDate() + 1);
    const date = first.toISOString().slice(0, 10).replaceAll("-", "");
    const time = (v) => v.slice(0, 8).replaceAll(":", "");
    const until =
      String(term.ends_on).slice(0, 10).replaceAll("-", "") + "T235959Z";
    events.push(
      `BEGIN:VEVENT\r\nUID:class-${m.id}@schoolhub\r\nDTSTAMP:${now}\r\nDTSTART;TZID=${esc(timezone)}:${date}T${time(m.starts_at)}\r\nDTEND;TZID=${esc(timezone)}:${date}T${time(m.ends_at)}\r\nRRULE:FREQ=WEEKLY;UNTIL=${until}\r\nSUMMARY:${esc(`${section.code} · ${section.name}`)}\r\nLOCATION:${esc(m.room_name)}\r\nEND:VEVENT`,
    );
  }
  for (const e of data.exams)
    events.push(
      `BEGIN:VEVENT\r\nUID:exam-${e.id}@schoolhub\r\nDTSTAMP:${now}\r\nDTSTART:${utc(e.starts_at)}\r\nDTEND:${utc(e.ends_at)}\r\nSUMMARY:${esc(e.title)}\r\nLOCATION:${esc(e.room_name)}\r\nEND:VEVENT`,
    );
  for (const e of data.schedule_exceptions)
    events.push(
      `BEGIN:VEVENT\r\nUID:event-${e.id}@schoolhub\r\nDTSTAMP:${now}\r\nDTSTART:${utc(e.starts_at)}\r\nDTEND:${utc(e.ends_at)}\r\nSUMMARY:${esc(`${e.kind}: ${e.title}`)}\r\nDESCRIPTION:${esc("School calendar changes take precedence over recurring class entries.")}\r\nEND:VEVENT`,
    );
  download(
    "school-hub-calendar.ics",
    new Blob(
      [
        `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//School Hub//EN\r\n${events.join("\r\n")}\r\nEND:VCALENDAR\r\n`,
      ],
      { type: "text/calendar" },
    ),
  );
}
