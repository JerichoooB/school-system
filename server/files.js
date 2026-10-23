import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { put, get, del } from "@vercel/blob";
import { getPool } from "./db.js";
import { authenticated, schoolError } from "./school.js";
export const storage = { put, get, del };
function validUTF8(buffer) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}
const safeId = (value) => (/^\d+$/.test(String(value)) ? String(value) : null);
async function visible(client, user, file, write = false) {
  if (user.role === "admin") return true;
  if (file.purpose === "announcement") {
    const a = (
      await client.query("SELECT * FROM announcements WHERE id=$1", [
        file.announcement_id,
      ])
    ).rows[0];
    if (!a) return false;
    if (String(a.author_id) === String(user.id)) return true;
    if (write) return false;
    if (
      new Date(a.publish_at) > new Date() ||
      (a.expires_at && new Date(a.expires_at) <= new Date()) ||
      (a.audience_role && a.audience_role !== user.role)
    )
      return false;
    if (a.program_id) {
      const p = (
        await client.query("SELECT program_id FROM profiles WHERE user_id=$1", [
          user.id,
        ])
      ).rows[0];
      if (String(p?.program_id) !== String(a.program_id)) return false;
    }
    if (!a.section_id) return true;
    const e = await client.query(
      "SELECT 1 FROM enrollments WHERE section_id=$1 AND student_id=$2 AND status='active'",
      [a.section_id, user.id],
    );
    return e.rowCount > 0;
  }
  if (
    write &&
    file.purpose === "submission" &&
    String(file.owner_id) !== String(user.id)
  )
    return false;
  if (file.purpose === "avatar")
    return !write || String(file.owner_id) === String(user.id);
  if (
    ["document", "submission"].includes(file.purpose) &&
    String(file.owner_id) === String(user.id)
  )
    return true;
  if (file.section_id) {
    const s = (
      await client.query("SELECT * FROM sections WHERE id=$1", [
        file.section_id,
      ])
    ).rows[0];
    if (String(s?.teacher_id) === String(user.id)) return true;
    if (
      !write &&
      ["material", "assignment", "announcement"].includes(file.purpose)
    ) {
      const active = await client.query(
        "SELECT 1 FROM enrollments WHERE section_id=$1 AND student_id=$2 AND status='active'",
        [file.section_id, user.id],
      );
      if (!active.rowCount) return false;
      if (file.assignment_id) {
        const a = (
          await client.query(
            "SELECT x.published FROM assignments a JOIN assessments x ON x.id=a.assessment_id WHERE a.id=$1",
            [file.assignment_id],
          )
        ).rows[0];
        return a?.published;
      }
      return true;
    }
  }
  return false;
}
export async function fileHandler(req, res) {
  const client = await getPool().connect();
  try {
    const user = await authenticated(req, client);
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET") {
      const file = (
        await client.query("SELECT * FROM files WHERE id=$1", [
          safeId(url.searchParams.get("id")),
        ])
      ).rows[0];
      if (!file || !(await visible(client, user, file)))
        throw schoolError(404, "File not found.");
      if (!process.env.BLOB_READ_WRITE_TOKEN)
        throw schoolError(503, "File storage is not configured.");
      const blob = await storage.get(file.pathname, {
        access: "private",
        useCache: false,
      });
      if (!blob || blob.statusCode !== 200)
        throw schoolError(404, "File not found in storage.");
      res.setHeader("Content-Type", file.content_type);
      res.setHeader(
        "Content-Disposition",
        `${file.purpose === "avatar" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      await new Promise((resolve, reject) => {
        const stream = Readable.fromWeb(blob.stream);
        stream.on("error", reject);
        res.on("finish", resolve);
        stream.pipe(res);
      });
      return;
    }
    if (req.method === "DELETE") {
      const file = (
        await client.query("SELECT * FROM files WHERE id=$1", [
          safeId(url.searchParams.get("id")),
        ])
      ).rows[0];
      if (!file || !(await visible(client, user, file, true)))
        throw schoolError(404, "File not found.");
      if (file.purpose === "submission") {
        const a = (
          await client.query(
            "SELECT a.due_at,a.allow_late FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=$1",
            [file.submission_id],
          )
        ).rows[0];
        if (
          user.role === "student" &&
          a &&
          !a.allow_late &&
          new Date(a.due_at) < new Date()
        )
          throw schoolError(403, "The submission deadline has passed.");
      }
      if (!process.env.BLOB_READ_WRITE_TOKEN)
        throw schoolError(503, "File storage is not configured.");
      await storage.del(file.pathname);
      await client.query("DELETE FROM files WHERE id=$1", [file.id]);
      await client.query(
        "INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)",
        [user.id, "delete", "files", file.id],
      );
      return res.end(JSON.stringify({ success: true }));
    }
    if (req.method !== "POST") throw schoolError(405, "Method not allowed.");
    if (!process.env.BLOB_READ_WRITE_TOKEN)
      throw schoolError(
        503,
        "File storage is not configured. Ask an administrator to connect Vercel Blob.",
      );
    let raw = "";
    if (req.body)
      raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    else
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 4100000)
          throw schoolError(413, "File is too large. Maximum upload: 3 MB.");
      }
    if (Buffer.byteLength(raw) > 4100000)
      throw schoolError(413, "File is too large.");
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw schoolError(400, "Invalid upload.");
    }
    if (
      !body ||
      typeof body.base64 !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64)
    )
      throw schoolError(400, "Invalid file encoding.");
    const buffer = Buffer.from(body.base64, "base64");
    if (!buffer.length || buffer.length > 3000000)
      throw schoolError(413, "Maximum upload: 3 MB.");
    const type = String(body.content_type),
      name = String(body.name || "")
        .replace(/[^a-zA-Z0-9._ -]/g, "_")
        .slice(0, 150);
    const magic =
      type === "application/pdf"
        ? buffer.subarray(0, 5).toString() === "%PDF-"
        : type === "image/png"
          ? buffer
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : type === "image/jpeg"
            ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
            : type === "image/webp"
              ? buffer.subarray(0, 4).toString() === "RIFF" &&
                buffer.subarray(8, 12).toString() === "WEBP"
              : type === "text/plain"
                ? !buffer.includes(0) && validUTF8(buffer)
                : false;
    if (!magic || !name)
      throw schoolError(
        400,
        "Supported files: PDF, PNG, JPEG, WebP, and plain text. File content must match its type.",
      );
    const purpose = String(body.purpose);
    let section_id = safeId(body.section_id),
      submission_id = null,
      assignment_id = null,
      announcement_id = null;
    if (["avatar", "document"].includes(purpose)) {
      section_id = null;
      if (purpose === "avatar" && !type.startsWith("image/"))
        throw schoolError(400, "Choose an image for your avatar.");
    } else if (purpose === "announcement") {
      const a = (
        await client.query("SELECT * FROM announcements WHERE id=$1", [
          safeId(body.announcement_id),
        ])
      ).rows[0];
      if (
        !a ||
        !(user.role === "admin" || String(a.author_id) === String(user.id))
      )
        throw schoolError(403, "You cannot attach files to this announcement.");
      section_id = a.section_id;
      announcement_id = a.id;
    } else if (purpose === "submission") {
      const sub = (
        await client.query(
          `SELECT sub.*,a.due_at,a.allow_late,x.section_id,x.published FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id JOIN assessments x ON x.id=a.assessment_id WHERE sub.id=$1 AND sub.student_id=$2`,
          [safeId(body.submission_id), user.id],
        )
      ).rows[0];
      if (
        !sub ||
        !sub.published ||
        (!sub.allow_late && new Date(sub.due_at) < new Date())
      )
        throw schoolError(403, "This submission is not open for uploads.");
      const active = await client.query(
        "SELECT 1 FROM enrollments e JOIN sections s ON s.id=e.section_id WHERE e.section_id=$1 AND e.student_id=$2 AND e.status='active' AND NOT s.archived",
        [sub.section_id, user.id],
      );
      if (!active.rowCount) throw schoolError(403, "Class access is required.");
      section_id = sub.section_id;
      submission_id = sub.id;
    } else if (["material", "assignment"].includes(purpose)) {
      if (purpose === "assignment") {
        const a = (
          await client.query(
            "SELECT a.id,x.section_id FROM assignments a JOIN assessments x ON x.id=a.assessment_id WHERE a.id=$1",
            [safeId(body.assignment_id)],
          )
        ).rows[0];
        if (!a) throw schoolError(404, "Assignment not found.");
        section_id = a.section_id;
        assignment_id = a.id;
      }
      const s = (
        await client.query("SELECT * FROM sections WHERE id=$1", [section_id])
      ).rows[0];
      if (
        !s ||
        s.archived ||
        !(user.role === "admin" || String(s.teacher_id) === String(user.id))
      )
        throw schoolError(403, "You cannot upload to this class.");
    } else throw schoolError(400, "Unknown upload purpose.");
    const pathname = `school/${user.id}/${randomUUID()}/${name}`;
    const blob = await storage.put(pathname, buffer, {
      access: "private",
      contentType: type,
      addRandomSuffix: false,
    });
    let file;
    try {
      file = (
        await client.query(
          "INSERT INTO files(owner_id,section_id,submission_id,assignment_id,purpose,pathname,name,content_type,bytes,announcement_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,name,purpose,bytes",
          [
            user.id,
            section_id,
            submission_id,
            assignment_id,
            purpose,
            blob.pathname,
            name,
            type,
            buffer.length,
            announcement_id,
          ],
        )
      ).rows[0];
    } catch (error) {
      await storage.del(blob.pathname);
      throw error;
    }
    if (submission_id) {
      await client.query(
        "UPDATE scores SET published=false WHERE student_id=$1 AND assessment_id=(SELECT assessment_id FROM assignments WHERE id=(SELECT assignment_id FROM submissions WHERE id=$2))",
        [user.id, submission_id],
      );
      await client.query(
        "UPDATE final_grades SET published=false WHERE student_id=$1 AND section_id=$2",
        [user.id, section_id],
      );
    }
    await client.query(
      "INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)",
      [user.id, "upload", "files", file.id],
    );
    res.end(JSON.stringify({ success: true, file }));
  } finally {
    client.release();
  }
}
