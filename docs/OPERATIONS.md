# School Hub operations

## Deploy

Use separate Neon databases/branches for production and previews. Never run tests against a production database.

1. `npm ci` with Node 24; `npm run build` and `npm run lint`.
2. Apply all additive migrations with `npm run db:migrate` from a trusted terminal. The script serializes migration runs and preserves existing users/records. It prefers `DATABASE_URL_UNPOOLED`; set both database variables when targeting a different database.
3. Set Vercel server variables: `DATABASE_URL`, `APP_URL`, Gmail SMTP settings, Google web client ID, and `BLOB_READ_WRITE_TOKEN` from a **private** Blob store connected to the correct project/environments. Set `VITE_GOOGLE_CLIENT_ID` to the matching public ID. The Formspree endpoint is public.
4. Add a random, server-only `CRON_SECRET` (at least 32 random bytes). Vercel automatically sends it as a Bearer header to configured cron jobs. Do not put it in a browser-prefixed variable.
5. Deploy. Vercel's daily cron at 00:00 UTC invokes `/api/jobs`. An administrator can also process the queue from Settings. The starter worker sends up to 100 messages per invocation, stopping after four minutes; inspect queue depth and configure a more frequent external scheduler or a suitable Vercel plan before using reminders for a large school. Gmail delivery quotas still apply.
6. Grant the first administrator only through `npm run admin:grant -- verified-account-email`. Subsequent roles are managed by administrators. A public signup never grants staff privileges.

## Initial school setup

Courses → Academic setup: academic years, departments, programs, terms, rooms and course catalog. Invite teachers/students; recipients sign up, verify, then sign in to accept their invitation. Create sections with teachers and capacity. Enroll students; add class times. Teachers create materials, assessments, assignments, exams and dated attendance sessions. Configure grading bands and attendance rules before publishing final grades.

All academic mutations are authorized by the API. Teachers can manage assigned sections, students can submit only to active enrollments, and unpublished scores/drafts remain private. Archived classes and assessments preserve history. Withdrawn enrollment is retained.

## Verify the deployed site

- `/api/health`: GET returns database availability, without account data or connection strings.
- Sign in as an administrator; verify the correct role and Academic setup.
- Use a temporary test class and authorized test accounts to verify teacher → assignment → student submission → teacher grade → student result. Archive the test class afterwards.
- Upload a small image, PDF or text file through Profile/Courses/Assignments. Download through `/api/file?id=...` while signed in; verify signed-out and unrelated users are denied. Public Blob URLs are not used.
- Confirm actual Gmail receipt for verification/reset/invitation and an administrator-triggered queued notification. Local tests mock SMTP and cannot prove inbox delivery.
- Submit a support message and verify it in Formspree. Uploaded support attachments are private School Hub links; the administrator must sign in to download them.
- Test mobile navigation and direct-page refreshes.

## Files

Uploads are limited to 3 MB to fit Vercel's request limits. Accepted types: PDF, PNG, JPEG, WebP and UTF-8/plain text. Binary signatures are checked. Avatars require images. Vercel Blob holds private bytes; PostgreSQL holds metadata, ownership and class/submission relationships. Downloads check the server session and file permissions. Deleting file bytes is separate from academic-record archival.

Keep Blob and database backups together: restoring only database metadata cannot restore deleted object bytes. Enable an object-storage retention/backup policy appropriate to the school's requirements before storing irreplaceable submissions. Vercel integration settings and external retention policies cannot be changed by repository code.

## Monitoring and jobs

Vercel runtime logs contain sanitized API error codes. Administrators see audit history, grade history, attendance corrections, and email job states in the app. Monitor `/api/health` with an uptime service and configure alerts for HTTP failures. Inspect failed email jobs; retry backoff is exponential, with a maximum of five attempts. Administrators can reset a failed job for retry after fixing its configuration. Queued notifications are deduplicated; SMTP delivery is at-least-once (a crash after SMTP acceptance can cause a repeat).

The starter data bootstrap fetches authorized records for the selected account; table search, sorting and pagination are client-side. For institution-scale records, move these queries to server pagination and reporting endpoints before load increases. This is a documented scale limit, not an authorization shortcut.

## Backup and recovery

Neon: verify the production project's restore-history window in the Neon console and choose retention suitable for the school. Record the project/branch and recovery procedure privately. Restore into a **new branch**, validate record counts and sign-in there, then deliberately switch connection strings; do not overwrite a live branch to test recovery.

For an independent PostgreSQL backup, install PostgreSQL 17+ client tools and run:

```sh
npm run db:backup -- /secure/path/school-hub.dump
```

The script passes connection credentials only through child environment variables, verifies remote TLS, creates owner-only output, and refuses to overwrite files. It uses direct `DATABASE_URL_UNPOOLED` when available. Keep backups outside Git, encrypted and access-controlled. Client tooling can be selected through `PG_DUMP_BIN`; custom tooling must preserve TLS verification for remote databases.

To rehearse recovery, create an empty isolated database, run `pg_restore --no-owner --no-acl --exit-on-error` against that database, and check table counts plus known fixture records. Restore tests in this task use only disposable local databases. Production Neon restore retention, external backups, uptime alerts, and Blob retention still require account-level configuration and operational verification.

## Automated verification

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_hub_test npm test
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_hub_test npm run test:browser
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_hub_test npm run test:school:browser
```

Install Playwright Chromium with `npx playwright install chromium`, or supply a trusted `BROWSER_EXECUTABLE`. Academic tests use unique temporary schemas inside the explicit `_test` database and drop only their own schema. Authentication tests truncate auth records in the isolated test database, so do not run suites concurrently against the same test database. Provider tests mock Blob/SMTP/Formspree boundaries; those are contract/authorization tests, not evidence of live external delivery.

## Explicit live academic check

`LIVE_ACADEMIC_TEST=1 npm run test:live:academics` exercises the actual deployed academic APIs with unique temporary administrator/teacher/student accounts, classes, submissions and private files. Use a matching database connection and `SMOKE_BASE_URL`. The opt-in flag is required; this is never run by CI. It avoids global policy changes and external message delivery. Cleanup removes only its tagged records and accounts; a cleanup error disables the temporary accounts and exits unsuccessfully for operator attention. Do not run it concurrently with school administration of its clearly tagged QA records.

`LIVE_VERIFY_GRADING_FIX=1` additionally verifies archived-assessment weight restoration and original-score limits. In proxy-only workspaces use `node --use-env-proxy --env-file-if-exists=.env.local scripts/smoke-academics.js` with the same opt-in variables. The ordinary deployment check supports `SMOKE_SKIP_CRON=1` to report automatic scheduling as explicitly deferred while testing other services; it does not change cron authentication or application configuration.

## Navigation performance

Authenticated screens share a persistent protected layout, so sidebar links reuse the loaded workspace instead of repeating session validation and the complete academic bootstrap on each click. The data stays in component memory, is refreshed after writes, and is revalidated every minute while visible or when a stale tab regains focus. API authorization remains server-side. A full page reload still validates the session and reloads data. Vercel functions use `sin1` to colocate with the production Neon database in Singapore; review this setting if the database region changes.
