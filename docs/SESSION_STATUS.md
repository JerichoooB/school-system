# Resume checkpoint — user paused work

Saved implementation and grading fixes: e5ab7f38 on main (preceded by ac5ab3f3 and 098a12ab). Latest user request is to save and continue later. Do not resume testing until they ask.

## Completed

- All 13 approved School Hub screens are implemented with Neon data and server-enforced administrator/teacher/student roles.
- Production schema: 43 tables, migrations through 007 applied without resetting existing records.
- jerichobalayog000@gmail.com is the active verified Administrator, explicitly chosen by the user.
- Build/lint pass. Current automated checks: 31 backend tests, 13 authentication browser checks, 10 academic browser/mobile/accessibility checks (54 total).
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

## Resume here

1. Verify Vercel has deployed the grading fixes. The final post-deployment live regression run was NOT started because the user paused.
2. Run the explicit live academic check with LIVE_VERIFY_GRADING_FIX=1 to verify the new archived-weight/original-score cases on Vercel and Neon. The ordinary 98-check live run already passed before these fixes; the extended run should add 7 HTTP assertions.
3. Confirm every new test fixture is removed and save the resulting report.

## Intentionally deferred / external limitations

- User explicitly said to leave CRON_SECRET for later. It was absent in the deployed function during checks. Do not add CRON_SECCRET compatibility: the user canceled that idea; all alias code was reverted and never deployed.
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
