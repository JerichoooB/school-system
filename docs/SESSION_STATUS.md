# Latest update — guided academic setup

- Suggested setup steps show record counts for departments, programs, academic years, terms, courses and classes, with links to the corresponding section. Rooms remain available in the setup tabs.
- Course creation can create and auto-select a department without leaving or clearing the draft. The UI explicitly explains that the department is saved immediately, even before the course is saved.
- Academic records create/edit inline, including departments, rooms and terms. Department lists show related programs/course codes; programs/courses show department names; terms show academic year names.
- Course catalog is the sole creation entry point: the academic setup Courses tab links to it instead of duplicating Add course.
- Deletion uses row locking and server-side dependency checks across all six catalog tables, including historical links. Errors return 409 with linked counts and example course/program/term/class names. Confirmation controls explicitly say Delete record.
- Lint/build, 31 backend tests and all 19 academic browser checks pass. Coverage includes quick department creation with draft preservation, automatic selection, inline edits, relationship display and blocked deletion. No schema migration required.
- Production verification follows deployment.

# Latest fix — distinguish creation from assignment

- Courses now has a prominent inline Create course form for code, name, optional description, credits and optional department, separate from Create class.
- Class assignment shows course codes/names and is disabled with explicit setup steps when courses, terms or active teachers are missing.
- Teachers/Students now have named invitation forms asking for name/email and fixing the intended role automatically. Optional name personalizes the secure invitation; recipients still create/verify their own account and accept the role. Existing account imports and teacher-department assignment are separately labeled.
- Academic setup tabs/actions use readable names (Rooms/Add room, Academic years, etc.). Existing accounts link to Settings for explicit role management.
- No schema migration. Lint/build, 31 backend tests and all 18 academic browser checks pass, including course creation, subsequent class selection, missing-teacher guidance and named role-specific invitation delivery (mock SMTP only).
- Browser fixture schemas from interrupted local diagnostic runs were cleaned after testing. a459c778 is live. Deployment smoke passed all 11 student pages, database/session/role/private-file checks, inline preferences and logout; 11 sidebar switches took 774ms with no repeated school/session reads. Temporary live fixtures were removed.

# Latest update — mobile navigation, tables and notification center

- Added mobile quick navigation for Dashboard/Courses/Schedule/Profile, safe-area spacing and active destination states. Added a keyboard skip-to-content link.
- Tables offer 8/20/50 rows, accessible sort state/direction controls, clearer page totals and an explicit empty-search recovery action. Search, sorting and pagination remain client-side for the already authorized dataset.
- Notification center shows unread counts and All/Unread filters, disables mark-all when caught up, closes on outside click or Escape and restores trigger focus for keyboard dismissal. Status badges now distinguish neutral/success/warning/error in both themes.
- Lint/build and all 17 academic browser checks pass. New checks exercise table size/sort/search recovery, notification filters/read/dismissal and mobile quick navigation; existing inline/profile/avatar/role/workflow/accessibility checks pass.
- 2ddc2adc is live. Deployed smoke passed database/session/role/private-file/job-denial/logout checks, all 11 student pages and an inline preference save. Eleven sidebar switches took 707ms with no repeated school/session reads. Temporary account and file cleanup succeeded. No backend or database schema changes are part of this update.

# Latest update — inline editing for settings and simple sections

- Preferences, school policies and grading policy now edit directly inside their cards with Save/Cancel; password change edits within Account & security. Existing help articles edit within the expanded article.
- Reusable EditableSection uses the same fields, serialization, validation and API authorization as existing dialogs. Dialogs remain available for other workflows. Inline fields preserve draft values on errors, discard on Cancel and close after successful save. Password confirmation checks locally before server submission.
- Lint/build and all 15 academic browser checks pass, including inline settings validation/cancel/persistence, password mismatch, grading policy, help article updates, old dialog flows, profile/avatar, mobile and light/dark accessibility.
- Deployment smoke now saves preferences for its unique temporary account through the inline editor and cleans up that account afterward.
- e5bbc6c9 is live. Deployed smoke passed, including saving preferences through the inline form for a unique temporary account. Eleven sidebar switches completed in 761ms without repeated school/session reads. Database, session, role, private Blob, unauthorized-job and logout checks passed; test account/files were removed.

# Latest update — whole-app UI polish

- Refined all 13 portal pages through shared typography, ivory/sage surfaces, consistent cards, table headers/row states, page icons, controls, form actions, tabs, files, calendars and empty states.
- Sidebar navigation scrolls independently while account, settings and support controls remain visible. Topbar stays available while scrolling. Mobile controls and spacing are responsive; reduced-motion preferences are respected.
- Login/signup/recovery now have consistent card surfaces and forms. Public support shares the account layout and works in both themes; its original Formspree submission behavior is preserved.
- Fixed keyboard access to scrollable calendars/tables and contrast issues found during accessibility review. Current user's avatar remains consistent across all locations.
- Lint/build pass. 13 academic browser checks + 14 account browser checks pass. Coverage includes all 13 desktop portal pages, mobile student/admin pages, light/dark portal accessibility and all public screens at desktop/mobile in both themes. Public overflow checks also run at 320/390/768/1440px through the existing auth suite.
- Screenshots reviewed outside Git under /workspace/schoolhub-ui-previews/polished. UI_REVIEW=1 regenerates portal captures during the academic browser suite.
- e2fcc274 is live. Deployed smoke checks passed database/session/role permissions, private Blob upload/download/deletion and anonymous denial, unauthorized job rejection, all 11 student pages and logout. Eleven sidebar switches completed in 807ms with no repeated session/school reads. Temporary test data was removed. No school-policy or schema changes are part of this UI update.

# Latest update — inline profile card editing

- Moved Edit profile from the banner into Personal information. Editing renders a form inside the card, with Save/Cancel, busy state, validation and inline errors.
- Emergency contact has its own inline Edit/Save/Cancel controls. Personal and emergency saves merge the latest other fields so neither card clears the other.
- Email stays read-only. Existing profile API and academic permissions are unchanged.
- Lint/build and all 13 academic browser checks pass. Coverage includes canceling each card, saving each card, preservation across edits and refresh, avatars, mobile layout and accessibility.

# Latest fix — profile avatar synchronization

- Header, sidebar and profile banner now use the same current user's newest avatar record, falling back to the name initial when no avatar remains.
- Upload/replacement/deletion already refresh workspace data; all three views now react to those updates, including across sidebar navigation.
- Lint/build pass. All 13 academic browser checks pass; the new check exercises upload, replacement, navigation, deletion and fallback. Blob delivery is substituted in the isolated browser test; role-scoped metadata reads use the real local API/database.
- Production bundle verification follows the push for this fix.

# Latest checkpoint — navigation performance

- Fixed repeated portal remounts: authenticated pages now share one protected layout and reuse in-memory workspace data during navigation.
- Mutations still refresh data; visible tabs refresh in the background every minute and on returning focus when stale. Revoked access redirects to sign-in. No school data is cached in localStorage.
- Vercel functions configured for sin1 (Singapore), near the production Neon host in ap-southeast-1.
- Lint/build pass. 12 academic browser checks and 13 auth browser checks pass, including no-repeat-read navigation and background revocation regression tests.
- Live smoke script now checks sidebar navigation rather than doing a full document reload per page, and reports elapsed navigation time plus zero repeated workspace/session reads.
- Production verification passed after 879fcede deployed: 11 real sidebar switches completed in 708ms total, with zero repeated session/school GETs. Database/session/role/Blob/job-denial/logout checks also passed; temporary account and file were removed. An initial smoke attempt found an ambiguous test selector matching both the logo and Dashboard link; the selector was corrected and the full check passed.
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
