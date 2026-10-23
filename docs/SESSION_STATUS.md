# Latest checkpoint — navigation performance

- Fixed repeated portal remounts: authenticated pages now share one protected layout and reuse in-memory workspace data during navigation.
- Mutations still refresh data; visible tabs refresh in the background every minute and on returning focus when stale. Revoked access redirects to sign-in. No school data is cached in localStorage.
- Vercel functions configured for sin1 (Singapore), near the production Neon host in ap-southeast-1.
- Lint/build pass. 12 academic browser checks and 13 auth browser checks pass, including no-repeat-read navigation and background revocation regression tests.
- Live smoke script now checks sidebar navigation rather than doing a full document reload per page, and reports elapsed navigation time plus zero repeated workspace/session reads.
- Production navigation verification pending deployment of this change.
- Operator confirmed both cron announcement email delivery and Formspree support receipt. Local production dump restored successfully into a disposable Windows database: 43 tables. Neon history window remains 6 hours. Blob store is private and currently empty. UptimeRobot reports Up. Regular backup scheduling remains outstanding.

# Resume checkpoint — live verification completed

Implementation and grading fixes are saved on main. The user resumed work and requested another live test after configuring CRON_SECRET. Latest verification completed successfully on 2026-10-23.

## Completed

- All 13 approved School Hub screens are implemented with Neon data and server-enforced administrator/teacher/student roles.
- Production schema: 43 tables, migrations through 007 applied without resetting existing records.
- jerichobalayog000@gmail.com is the active verified Administrator, explicitly chosen by the user.
- Build/lint pass. Current automated checks: 31 backend tests (previously passed), 13 authentication browser checks, 12 academic browser/mobile/accessibility checks (56 total).
- Live schoolhub-ri.vercel.app: login/session/logout, role-scoped data, private Blob upload/download/deletion and anonymous denial, and all 11 student routes passed.
- Expanded live academic workflow passed 98 HTTP assertions: setup, enrollment/capacity, timetables/conflicts, course resources and private attachments, assignment drafts/submissions/history, rubrics, resubmission invalidation, scores/final grades, exams, attendance/bulk corrections, announcement scheduling/reads/files, notifications, profiles/preferences, CSV import, catalog edits, help publishing, password/session revocation, inactive users, withdrawal/history and class archival.
- All temporary live accounts, files and academic records from that run were removed successfully.
- Backup/restore rehearsal passed: all 43 tables, known fixture, owner-only backup permissions, isolated local restore target removed.
- Neon project metadata confirms 21,600 seconds (6 hours) of configured history retention. A real production restore was not performed.

## Bugs found and fixed during expanded tests

- Archived assessments incorrectly counted toward the 100% weight limit. Active-weight checks now exclude archived records.
- Restoring an assessment now rejects weights above 100% and rolls the change back.
- Lowering maximum points now checks the original entered score, before late penalties.
- Regression tests passed locally. Code is committed/pushed in e5ab7f38.

## Latest live verification

- Deployment check passed without SMOKE_SKIP_CRON: PostgreSQL, HTTPS login/session, role-scoped data, email configuration presence, CRON_SECRET presence, private Blob upload/download/deletion and anonymous denial, unauthorized job rejection, all 11 student browser routes, and logout revocation.
- Extended live academic check passed **105 HTTP assertions**, including the archived-assessment weight and original-score regressions against the deployed app.
- All temporary live accounts, files and academic records were removed successfully.
- Lint and production build passed during this resumed session.
- Earlier 404/405 responses came from a deployment that did not expose the current academic API. The latest deployment passes these checks.

## Remaining operational verification

- Verify an actual authenticated Vercel scheduled invocation; presence of CRON_SECRET and unauthorized request rejection do not prove scheduled execution or inbox delivery.
- Verify real receipt of queued notification emails and Formspree support messages with the operator.
- Confirm production recovery, Blob backup/retention and external uptime alerts in the provider accounts.

## Intentionally deferred / external limitations

- User has now configured CRON_SECRET; deployed presence checks pass. No CRON_SECCRET compatibility was added. Actual scheduled execution remains unverified.
- Deployment check supports SMOKE_SKIP_CRON=1 to report this omission as an explicit skip. This flag changes tests only, not production authentication/configuration.
- Manual email queue logic, failures and retries pass isolated tests with mocked SMTP. Real receipt of new queued notifications and Formspree messages remains unverified in this run. Prior Gmail signup delivery was confirmed by the user.
- Production Blob backup/retention and external uptime alerts still require operator account-level verification. Do not claim they were configured.

## Commands

```sh
npm run lint && npm run build
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_google_test npm test
BROWSER_EXECUTABLE=/tmp/chromium TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_hub_test npm run test:browser
BROWSER_EXECUTABLE=/tmp/chromium TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_hub_test npm run test:school:browser
SMOKE_SKIP_CRON=1 SMOKE_BROWSER=1 BROWSER_EXECUTABLE=/tmp/chromium node --use-env-proxy --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/smoke-deployment.js
LIVE_ACADEMIC_TEST=1 LIVE_VERIFY_GRADING_FIX=1 node --use-env-proxy --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/smoke-academics.js
```

Never print environment values, connection strings, cookies or SMTP/Blob/cron secrets. Never run destructive test suites against production. Live academic tests create and clean only unique tagged fixtures; no global policies or outbound messages are changed. Their explicit opt-in flag is required. Browser requests use Node's TLS-verified fetch in this proxy environment; never disable certificate verification. Backup fixtures/files live outside the checkout under /workspace/school-hub-backups and are not committed.
