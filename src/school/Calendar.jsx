import { useState } from "react";
import { Card } from "./ui";
export default function Calendar({ data, sectionLabel, timezone }) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    offset = (month.getDay() + 6) % 7;
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function dateInZone(value) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  }
  return (
    <Card
      title={month.toLocaleDateString("en", { month: "long", year: "numeric" })}
      action={
        <div className="sh-actions">
          <button
            aria-label="Previous month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            ←
          </button>
          <button
            onClick={() =>
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            Today
          </button>
          <button
            aria-label="Next month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            →
          </button>
        </div>
      }
    >
      <div className="sh-month-scroll" tabIndex={0} role="region" aria-label="Monthly schedule">
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
              key = iso(d),
              weekday = ((d.getDay() + 6) % 7) + 1;
            const exceptions = data.schedule_exceptions.filter(
              (x) =>
                dateInZone(x.starts_at) <= key && dateInZone(x.ends_at) >= key,
            );
            return (
              <div className="sh-month-day" key={i}>
                <strong>{d.getDate()}</strong>
                {exceptions.map((x) => (
                  <span className="sh-event" key={`x${x.id}`}>
                    {x.kind}: {x.title}
                  </span>
                ))}
                {data.meetings
                  .filter((m) => {
                    const s = data.sections.find(
                      (s) => String(s.id) === String(m.section_id),
                    );
                    const term = data.terms.find(
                      (t) => String(t.id) === String(s?.term_id),
                    );
                    return (
                      m.weekday === weekday &&
                      !s?.archived &&
                      term &&
                      String(term.starts_on).slice(0, 10) <= key &&
                      String(term.ends_on).slice(0, 10) >= key &&
                      !exceptions.some(
                        (x) =>
                          (x.kind === "holiday" || x.kind === "cancellation") &&
                          (!x.section_id ||
                            String(x.section_id) === String(m.section_id)),
                      )
                    );
                  })
                  .map((m) => (
                    <span key={`m${m.id}`} className="sh-month-class">
                      {m.starts_at.slice(0, 5)} {sectionLabel(m)}
                      <small>{m.room_name}</small>
                    </span>
                  ))}
                {data.exams
                  .filter((e) => dateInZone(e.starts_at) === key)
                  .map((e) => (
                    <span key={`e${e.id}`} className="sh-event">
                      Exam: {e.title}
                    </span>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
