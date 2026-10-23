# Resume checkpoint

Implementation commit: 098a12ab (main). A follow-up adds the email retry control and improves the deployment smoke check.

Completed:
- 13 approved screens backed by Neon, roles and academic APIs; schema has 43 tables.
- All migrations through 007 applied to the production Neon database, preserving existing accounts.
- jerichobalayog000@gmail.com granted the Administrator role, explicitly requested by the user.
- Build/lint and 53 backend/browser checks passed; backup restored all 43 tables and a fixture in an isolated local database.
- schoolhub-ri.vercel.app deployed and verified: API health, login/session/logout, role-scoped data, live private Blob upload/download/deletion/anonymous denial, and browser navigation across 11 student routes.
- Temporary production test accounts and files were removed.

Pending:
- The deployed function reported CRON_SECRET missing. The user said it was added; asked them to confirm Production and redeploy. A fresh follow-up deployment may pick up their saved setting. Recheck before asking again.
- Production receipt of newly queued emails remains unverified. Prior Gmail signup delivery was confirmed by the user; current SMTP/queue behavior is tested with mocked delivery.
- Operator account-level checks: Neon restore retention, Blob retention/backups, uptime alerting. See OPERATIONS.md.

Useful commands:
- npm run build && npm run lint
- TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_google_test npm test
- BROWSER_EXECUTABLE=/tmp/chromium TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_hub_test npm run test:school:browser
- SMOKE_BROWSER=1 BROWSER_EXECUTABLE=/tmp/chromium node --use-env-proxy --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/smoke-deployment.js

Never print environment values, session cookies, database URLs or SMTP/Blob/cron secrets. Production smoke checks create only their own unique fixtures. Do not run destructive test suites against production. Browser access uses Node's TLS-verified fetch through the cloud proxy; do not disable TLS verification.
