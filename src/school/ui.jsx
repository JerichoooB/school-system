import { useEffect, useId, useRef, useState } from "react";
import { zonedISO, zonedInput } from "../../shared/time";
import { X, Search, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
export function Empty({ children = "No records yet." }) {
  return <div className="sh-empty"><Inbox size={28} strokeWidth={1.5} aria-hidden="true" /><p>{children}</p></div>;
}
export function Card({ title, action, children, className = "" }) {
  return (
    <section className={`sh-card ${className}`}>
      {title && (
        <div className="sh-card-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Stat({ label, value, detail }) {
  return (
    <div className="sh-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function Badge({ children }) {
  return (
    <span
      className={`sh-badge ${["absent", "inactive", "overdue"].includes(children) ? "warning" : ""}`}
    >
      {children}
    </span>
  );
}
export function Table({ rows, columns, search = true, empty, exportAction }) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [sort, setSort] = useState(null),
    [descending, setDescending] = useState(false);
  const filtered = rows.filter((row) =>
    Object.values(row).some((v) =>
      String(v ?? "")
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );
  if (sort)
    filtered.sort(
      (a, b) =>
        String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, {
          numeric: true,
        }) * (descending ? -1 : 1),
    );
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 8) - 1),
  );
  return (
    <>
      {search && (
        <div className="sh-toolbar">
          <label className="sh-search">
            <Search size={17} />
            <input
              aria-label="Search records"
              placeholder="Search records…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          {exportAction}
        </div>
      )}
      {!filtered.length ? (
        <Empty>{empty}</Empty>
      ) : (
        <>
          <div className="sh-table-wrap" tabIndex={0} role="region" aria-label="Table results">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>
                      {c.key !== "actions" ? (
                        <button
                          className="sh-sort"
                          onClick={() => {
                            setSort(c.key);
                            setDescending(sort === c.key ? !descending : false);
                          }}
                        >
                          {c.label}
                          {sort === c.key ? (descending ? " ↓" : " ↑") : ""}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(current * 8, current * 8 + 8).map((row, i) => (
                  <tr key={row.id ?? i}>
                    {columns.map((c) => (
                      <td key={c.key}>
                        {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sh-pagination">
            <span>
              {current * 8 + 1}–{Math.min((current + 1) * 8, filtered.length)}{" "}
              of {filtered.length}
            </span>
            <button
              aria-label="Previous page"
              disabled={!current}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>Page {current + 1}</span>
            <button
              aria-label="Next page"
              disabled={(current + 1) * 8 >= filtered.length}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </>
  );
}
export function EditableSection({ title, label, fields, initial, onSave, children, canEdit = true, card = true }) {
  const [editing, setEditing] = useState(false);
  const action = canEdit && !editing && <button onClick={() => setEditing(true)}>{label || `Edit ${title.toLowerCase()}`}</button>;
  const content = editing ? (
    <FormDialog inline title={title} fields={fields} initial={initial} onSave={onSave} onClose={() => setEditing(false)} />
  ) : children;
  return card ? <Card title={title} action={action}>{content}</Card> : (
    <div className="sh-inline-section">{action}{content}</div>
  );
}
export function FormDialog({ title, fields, initial = {}, onClose, onSave, inline = false }) {
  const modal = useRef(null);
  const titleId = useId();
  const Container = inline ? "section" : "dialog";
  useEffect(() => {
    if (!inline) modal.current?.showModal();
  }, [inline]);
  const [values, setValues] = useState(() =>
      Object.fromEntries(
        Object.entries(initial).map(([k, v]) => {
          const f = fields.find((f) => f.key === k);
          return [
            k,
            f?.type === "datetime-local" && v && String(v).length > 16
              ? zonedInput(
                  v,
                  f.timezone ||
                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                )
              : v,
          ];
        }),
      ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = { ...values };
      for (const f of fields)
        if (f.type === "datetime-local" && payload[f.key])
          payload[f.key] = zonedISO(
            payload[f.key],
            f.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          );
      await onSave(payload);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={inline ? "sh-inline-editor" : "sh-overlay"}
      onClick={(e) => {
        if (!inline && e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <Container
        ref={modal}
        className={inline ? "sh-form" : "sh-dialog"}
        aria-label={inline ? `Edit ${title.toLowerCase()}` : undefined}
        aria-labelledby={inline ? undefined : titleId}
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) onClose();
        }}
      >
        {!inline && <header>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </header>}
        <form onSubmit={submit} aria-label={inline ? `Edit ${title.toLowerCase()}` : undefined}>
          {fields.map((f) => (
            <label
              key={f.key}
              className={f.type === "checkbox" ? "sh-check" : ""}
            >
              {f.type === "checkbox" ? (
                <>
                  <input
                    type="checkbox"
                    checked={values[f.key] === true}
                    onChange={(e) =>
                      setValues({ ...values, [f.key]: e.target.checked })
                    }
                  />
                  {f.label}
                </>
              ) : (
                <>
                  <span>
                    {f.label}
                    {f.optional ? " (optional)" : ""}
                  </span>
                  {f.options ? (
                    <select
                      aria-label={f.label + (f.optional ? " (optional)" : "")}
                      autoFocus={fields[0] === f}
                      required={!f.optional}
                      value={values[f.key] ?? ""}
                      onChange={(e) =>
                        setValues({ ...values, [f.key]: e.target.value })
                      }
                    >
                      <option value="">Select…</option>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      aria-label={f.label + (f.optional ? " (optional)" : "")}
                      required={!f.optional}
                      rows={5}
                      maxLength={f.maxLength || 12000}
                      value={values[f.key] ?? ""}
                      onChange={(e) =>
                        setValues({ ...values, [f.key]: e.target.value })
                      }
                    />
                  ) : (
                    <input
                      aria-label={f.label + (f.optional ? " (optional)" : "")}
                      autoFocus={fields[0] === f}
                      type={f.type || "text"}
                      required={!f.optional}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      maxLength={f.maxLength || 200}
                      value={values[f.key] ?? ""}
                      onChange={(e) =>
                        setValues({ ...values, [f.key]: e.target.value })
                      }
                    />
                  )}
                </>
              )}
              {f.type === "datetime-local" && (
                <small aria-hidden="true">
                  Time in{" "}
                  {f.timezone ||
                    Intl.DateTimeFormat().resolvedOptions().timeZone}
                </small>
              )}
              {f.help && <small aria-hidden="true">{f.help}</small>}
            </label>
          ))}
          {error && (
            <p className="sh-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button className="sh-primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      </Container>
    </div>
  );
}
