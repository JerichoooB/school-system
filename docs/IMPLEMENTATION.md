# School Hub implementation checklist

Approved scope: all 13 design concepts and the functional specification discussed in chat.
An unchecked item is not complete. Production service configuration and school-policy choices must not be represented as tested functionality.

## Foundations
- [x] Server-enforced student, teacher and administrator permissions; disabled-account protection
- [x] Additive PostgreSQL migrations, constraints, indexes and isolated test fixtures
- [x] Department/program/term/course/room/section/enrollment management
- [x] Conflict-safe schedules, capacity limits, archive/history
- [x] Administrator bootstrap command without public privilege escalation

## Screens and workflows
- [x] Live role-specific dashboard without invented student data
- [x] Profile, emergency contacts, official academic fields and avatar
- [x] Courses, syllabus/materials, course details and completion tracking
- [x] Weekly/monthly timetable, exceptions, holidays and calendar export
- [x] Assessment categories/weights, scores, drafts, publications, grade history and reports
- [x] Attendance sessions, marking, corrections, percentage policies and exports
- [x] Assignments, text/file submissions, version history, deadlines, feedback and rubrics
- [x] Exam schedules, conflict checks, instructions and released results
- [x] Announcements with scheduling, targeting, pinning, read status and notifications
- [x] Student and teacher administration, account status, enrollment, invitations and CSV import/export
- [x] Preferences, sessions, change password, notification preferences and school policies
- [x] Searchable FAQs and Formspree support with submission feedback

## Shared services and delivery
- [x] Private Vercel Blob files with authorization, limits, download and deletion
- [x] In-app notifications and email jobs with retries/reminders
- [x] Administrative audit history
- [x] Responsive layouts, keyboard access and loading/empty/error states
- [x] API authorization and end-to-end lifecycle tests; existing auth regression checks
- [x] Production migrations and environment setup documented
- [x] Backup/recovery and monitoring procedures documented and verified where accessible

Online exam-taking and a separate in-app support ticket system were conditional alternatives in the specification; the approved designs show scheduled exams/results and Formspree support. They should not be claimed as implemented by those screens.

## Release checks still tracked separately
- [ ] Deployed Vercel build verified against the migrated Neon database
- [ ] Live private Blob upload/download/deletion verified after deployment
- [ ] Cron secret and deployed scheduling verified in the Vercel account
- [ ] Production inbox delivery of new queued notifications verified (SMTP contract tests pass; prior signup delivery was confirmed by the user)
- [ ] Production Neon restore retention, Blob retention/backup and external uptime alerts configured by the operator

The checked implementation items refer to code and local/isolated validation. They do not substitute for these account-level operational checks. The application currently supports English and light/dark appearance; it does not expose untranslated language choices. Exam-taking and in-app ticketing remain conditional alternatives, not the scheduled-exam/Formspree workflows selected here.
