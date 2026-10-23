import { createPool } from "../server/db.js";
// Explicit operator command. Never grant administrator privileges during public signup.
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@"))
  throw new Error("Usage: npm run admin:grant -- account-email");
const pool = createPool(process.env.DATABASE_URL);
try {
  const result = await pool.query(
    "UPDATE users SET role='admin' WHERE email=$1 AND email_verified=1 AND status='active' RETURNING id",
    [email],
  );
  if (!result.rowCount)
    throw new Error(
      "No active verified account found. Sign up and verify first.",
    );
  console.log("Administrator role granted to the selected account.");
} finally {
  await pool.end();
}
