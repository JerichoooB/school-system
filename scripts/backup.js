import { spawn } from "node:child_process";
import { mkdir, open, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
// Password travels through the child environment, never command arguments or logs.
const connection = new URL(
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
);
const output = resolve(
  process.argv[2] ||
    `../school-hub-backups/school-hub-${new Date().toISOString().replaceAll(":", "-")}.dump`,
);
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
const file = await open(output, "wx", 0o600);
const local = ["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname);
const env = {
  ...process.env,
  PGHOST: connection.hostname,
  PGPORT: connection.port || "5432",
  PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
  PGUSER: decodeURIComponent(connection.username),
  PGPASSWORD: decodeURIComponent(connection.password),
  PGSSLMODE: local ? "disable" : "verify-full",
  PGSSLROOTCERT:
    process.env.PGSSLROOTCERT || "/etc/ssl/certs/ca-certificates.crt",
};
try {
  const child = spawn(
    process.env.PG_DUMP_BIN || "pg_dump",
    ["--format=custom", "--no-owner", "--no-acl"],
    { env, stdio: ["ignore", file.fd, "pipe"] },
  );
  let failed = false;
  child.stderr.on("data", () => {
    failed = true;
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (code !== 0)
    throw new Error(
      failed
        ? "pg_dump failed; check trusted PostgreSQL client installation and database connectivity."
        : "Backup command failed.",
    );
  console.log(`Backup written with owner-only permissions: ${output}`);
} catch (error) {
  await unlink(output).catch(() => {});
  console.error(
    error.code === "ENOENT"
      ? "Install PostgreSQL client tools before running db:backup."
      : error.message,
  );
  process.exitCode = 1;
} finally {
  await file.close();
}
