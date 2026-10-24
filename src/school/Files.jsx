import { useEffect, useRef, useState } from "react";
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
  hideTitle = false,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef(null);
  const [pendingPhoto, setPendingPhoto] = useState(null), [deleting, setDeleting] = useState(null);
  useEffect(() => () => { if(pendingPhoto) URL.revokeObjectURL(pendingPhoto.url); }, [pendingPhoto]);
  function choose(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    if (purpose !== "avatar") { upload(file); return; }
    if (file.size > 3000000) { setError("Choose a photo smaller than 3 MB."); e.target.value=""; return; }
    if (!["image/png","image/jpeg","image/webp"].includes(file.type)) { setError("Choose a PNG, JPEG or WebP photo."); e.target.value=""; return; }
    setPendingPhoto({file,url:URL.createObjectURL(file)});
    e.target.value="";
  }
  const visible = files.filter(
    (f) =>
      f.purpose === purpose &&
      (!sectionId || String(f.section_id) === String(sectionId)) &&
      (!submissionId || String(f.submission_id) === String(submissionId)) &&
      (!assignmentId || String(f.assignment_id) === String(assignmentId)) &&
      (!announcementId || String(f.announcement_id) === String(announcementId)),
  );
  async function upload(file) {
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
      setPendingPhoto(null);
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
      setDeleting(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sh-files">
      {!hideTitle && <h3>{title}</h3>}
      {visible.map((f, index) => (
        <div className="sh-list-item" key={f.id}>
          <a href={`/api/file?id=${f.id}`} target="_blank" rel="noreferrer">
            <FileText size={15} /> {f.name}{" "}
            <small>{(f.bytes / 1000).toFixed(0)} KB{purpose === "avatar" ? (index === 0 ? " · Current photo" : " · Previous photo") : ""}</small>
          </a>
          {canUpload && (
            <button
              aria-label={`Delete ${f.name}`}
              disabled={busy}
              onClick={() => { if (["avatar","document"].includes(purpose)) setDeleting(f.id); else remove(f.id); }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      {deleting && <div className="sh-file-confirm" role="group" aria-label="Confirm file removal">
        <p>Remove {visible.find(f=>f.id===deleting)?.name}?{purpose === "avatar" ? " If an older photo remains, it becomes your current photo." : " This cannot be undone."}</p>
        <div className="sh-actions"><button type="button" disabled={busy} onClick={()=>remove(deleting)}>Remove file</button><button type="button" disabled={busy} onClick={()=>setDeleting(null)}>Keep file</button></div>
      </div>}
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
            onChange={choose}
          />
          <button disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={15} />
            {busy ? "Uploading…" : purpose === "avatar" ? "Choose photo" : "Upload file"}
          </button>
          <small className="sh-muted">{purpose === "avatar" ? "PNG, JPEG or WebP · Up to 3 MB. Preview before saving." : "Private storage · PDF, images, or text · Up to 3 MB"}</small>
          {pendingPhoto && <div className="sh-photo-preview" role="group" aria-label="New profile photo preview">
            <img src={pendingPhoto.url} alt="Preview of your selected profile photo" />
            <p>{pendingPhoto.file.name}</p>
            <div className="sh-actions"><button className="sh-primary" type="button" disabled={busy} onClick={()=>upload(pendingPhoto.file)}>{busy ? "Uploading…" : "Use this photo"}</button><button type="button" disabled={busy} onClick={()=>setPendingPhoto(null)}>Cancel photo</button></div>
          </div>}
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
