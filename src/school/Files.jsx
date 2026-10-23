import { useRef, useState } from "react";
import { Upload, FileText, Trash2 } from "lucide-react";
export default function Files({
  files = [],
  purpose,
  sectionId,
  submissionId,
  assignmentId,
  announcementId,
  canUpload = false,
  onChanged,
  title = "Files",
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef(null);
  const visible = files.filter(
    (f) =>
      f.purpose === purpose &&
      (!sectionId || String(f.section_id) === String(sectionId)) &&
      (!submissionId || String(f.submission_id) === String(submissionId)) &&
      (!assignmentId || String(f.assignment_id) === String(assignmentId)) &&
      (!announcementId || String(f.announcement_id) === String(announcementId)),
  );
  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    if (file.size > 3000000) {
      setError("Choose a file smaller than 3 MB.");
      return;
    }
    setBusy(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          content_type: file.type || "text/plain",
          base64,
          purpose,
          section_id: sectionId,
          submission_id: submissionId,
          assignment_id: assignmentId,
          announcement_id: announcementId,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      await onChanged();
    } catch (e) {
      setError(e.message || "Upload failed. Please retry.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function remove(id) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/file?id=${id}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sh-files">
      <h3>{title}</h3>
      {visible.map((f) => (
        <div className="sh-list-item" key={f.id}>
          <a href={`/api/file?id=${f.id}`} target="_blank" rel="noreferrer">
            <FileText size={15} /> {f.name}{" "}
            <small>{(f.bytes / 1000).toFixed(0)} KB</small>
          </a>
          {canUpload && (
            <button
              aria-label={`Delete ${f.name}`}
              disabled={busy}
              onClick={() => remove(f.id)}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      {canUpload && (
        <>
          <input
            ref={input}
            className="sh-file-input"
            type="file"
            accept={
              purpose === "avatar"
                ? "image/png,image/jpeg,image/webp"
                : "application/pdf,image/png,image/jpeg,image/webp,text/plain"
            }
            aria-label={`Upload ${title.toLowerCase()}`}
            disabled={busy}
            onChange={upload}
          />
          <button disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={15} />
            {busy ? "Uploading…" : "Upload file"}
          </button>
          <small className="sh-muted">
            Private storage · PDF, images, or text · Up to 3 MB
          </small>
        </>
      )}
      {error && (
        <p role="alert" className="sh-error">
          {error}
        </p>
      )}
    </div>
  );
}
