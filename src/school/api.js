export async function schoolRequest(resource, body) {
  const response = await fetch(
    `/api/school${resource ? `?resource=${encodeURIComponent(resource)}` : ""}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.message || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return result;
}
export function downloadCSV(name, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const escape = (value) =>
    `"${String(value ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""')}"`;
  const blob = new Blob(
    [
      "\uFEFF" +
        [keys, ...rows.map((row) => keys.map((k) => row[k]))]
          .map((row) => row.map(escape).join(","))
          .join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  download(name, blob);
}
export function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
