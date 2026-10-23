import { readFile, readdir } from "node:fs/promises";
import { createPool } from "../server/db.js";
let pool;
try {
  pool = createPool(
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  );
  // Migrations are additive and repeatable; serialize concurrent deploy invocations.
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(724610)");
    for (const name of (
      await readdir(new URL("../db/migrations/", import.meta.url))
    )
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      await client.query(
        await readFile(
          new URL(`../db/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
      console.log(`Applied ${name}`);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(724610)");
    client.release();
  }
  console.log("School Hub PostgreSQL schema is up to date.");
} catch (error) {
  console.error("Migration failed.", { code: error.code || "CONFIGURATION" });
  process.exitCode = 1;
} finally {
  await pool?.end();
}
