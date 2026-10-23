# School Hub

React/Vite frontend and Node API functions deployed together on **Vercel**, with **Neon PostgreSQL** for accounts and sessions. Resend delivers account emails; Formspree receives support requests. PHP, MySQL, Composer, and PHPMailer are no longer used.

## Local development

Use Node 24 (`.nvmrc`) and npm:

```sh
npm ci
cp .env.example .env.local
# Fill in server settings in this ignored file.
npm run db:migrate
npm run dev
```

Vite runs on port 5173 and proxies `/api` to the Node development server on port 3001. Keep the frontend and API on the same public origin. `APP_URL` must match the browser origin exactly (use `http://localhost:5173` locally). `npm run build` creates the production frontend; `npm run lint` checks frontend and server source. `npm run preview` serves only built frontend assets, not the API.

For a disposable local PostgreSQL database, Docker users can run:

```sh
docker run -d --name school-hub-dev-db -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=school_hub_dev -p 127.0.0.1:55432:5432 postgres:17-alpine
```

Use `DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_hub_dev` locally. Trust authentication is limited to this disposable loopback development database; do not use it in production. Keep existing database containers and files; do not overwrite them. Run migrations again when reconnecting to a different database.

## Neon CLI setup

The project is linked and remotely verified in ignored `.neon` to organization `org-patient-haze-82231060`, project `muddy-morning-65347739`, branch `production`. `neon.ts` declares PostgreSQL-only infrastructure; authentication remains in the existing app API. Neon hosts the database; the frontend and API still deploy to Vercel.

In this cloud workspace the global npm and CLI config directories are not writable. Use:

```sh
npm_config_cache=/workspace/.npm-cache npx neon@latest login --config-dir /workspace/.neon-cli
npm_config_cache=/workspace/.npm-cache npx neon@latest deploy --config-dir /workspace/.neon-cli
```

Finish login in the browser. Deploy provisions declared services and pulls branch variables to `.env` if it exists, otherwise `.env.local`. Preserve those files and never commit them. Node scripts load `.env.local` then `.env`, so `.env` takes precedence when both exist, matching the CLI's target. An already exported environment variable takes priority over either file. Vite keeps its standard precedence for public `VITE_*` build settings.

The app uses pooled `DATABASE_URL`; the migration script prefers direct `DATABASE_URL_UNPOOLED`, falling back to `DATABASE_URL` for local PostgreSQL. Vercel Fluid compute is supported through `attachDatabasePool` from `@vercel/functions`. Leave `DATABASE_TRANSPORT=tcp` on Vercel. In this cloud workspace, direct TCP DNS lookup is unavailable (`EAI_AGAIN`), so the ignored `.env.local` sets `DATABASE_TRANSPORT=websocket`: the Neon driver carries PostgreSQL over a TLS-verified WebSocket through the supplied HTTPS proxy. This route supports the app’s interactive transactions. Loopback PostgreSQL always uses `pg`. Both routes retain certificate verification.

After deploy, run `npm run db:migrate`, start `npm run dev`, and run `npm run test:smoke` in another terminal. The smoke check creates one unique temporary verified account, tests login/session/logout through the running app, and removes its own fixture; it never truncates tables or sends email. It defaults to the local app on port 5173 (`SMOKE_BASE_URL` overrides this). Do not run the destructive integration tests against production.

## Deploy to Vercel + Neon

1. Create a Neon project. Use separate branches/databases for production and preview deployments. Copy the **pooled PostgreSQL URL** into Vercel's server-only `DATABASE_URL` secret. Remote TLS certificate verification is enforced by the API.
2. Import this repository into Vercel, select Vite, and use repository root as the project root. Node 24, `npm run build`, and `dist` are configured. `vercel.json` preserves `/api/*` functions and rewrites frontend routes for direct navigation.
3. Configure these environment variables for each appropriate Vercel environment:

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | Secret Neon connection URL; server only. Never use a `VITE_` prefix. |
   | `DATABASE_URL_UNPOOLED` | Secret direct Neon URL used for migrations. |
   | `APP_URL` | Exact canonical HTTPS frontend origin, without a path. Also used in password-reset links. |
   | `RESEND_API_KEY` | Secret server-only Resend key with permission to send emails. |
   | `MAIL_FROM` | Sender on a domain verified in Resend, e.g. `School Hub <accounts@school.example>`. |
   | `GOOGLE_CLIENT_ID` | Server-side Google OAuth web client ID, if Google sign-in is enabled. |
   | `VITE_GOOGLE_CLIENT_ID` | Same public OAuth client ID; omit to hide Google sign-in. |
   | `VITE_FORMSPREE_ENDPOINT` | Public support form endpoint; defaults to `https://formspree.io/f/xgaawjzg`. |

4. Apply `db/migrations/001_auth.sql` once using the Neon SQL Editor, or run `npm run db:migrate` from a trusted terminal with `DATABASE_URL` securely configured. The migration is repeatable. Migrations are intentionally separate from the Vercel build so preview builds cannot modify production databases.
5. Verify the sender domain in Resend. Confirm the support recipient in Formspree and restrict the form to your deployed domain in its settings. Add the exact deployed origin to Google's authorized JavaScript origins if enabling Google sign-in. Preview deployments need their own matching `APP_URL` and OAuth origins.
6. Deploy, then verify signup → email code → sign-in, page refresh, sign-out, and password reset on the actual HTTPS domain. Check support submission delivery separately. Changing `VITE_*` settings requires a new build. Never put secrets in git, browser code, logs, or chat.

Neon hosts the database; Vercel hosts the website and API. Resend and Formspree are separate delivery services. No live Neon migration, deployment, or email delivery is implied by local test success.

## Authentication

API endpoints: `register`, `verify-email`, `resend-verification`, `login`, `google-login`, `session` (GET), `logout`, `forgot-password`, and `reset-password`, all under `/api/`. The remaining endpoints accept POST. Requests are same-origin; unrelated origins are rejected. PostgreSQL stores password hashes, hashed verification/reset/session tokens, expiration times, and shared rate limits. Session cookies are HttpOnly, SameSite=Lax, and Secure in production. Password reset invalidates all existing sessions. Every future protected data API must validate the server session; the React route guard is only navigation UI.

The existing dashboard still shows demo data. Its visual redesign and school-domain tables/APIs are intentionally pending design approval. Authentication tables are not a complete school records schema.

## Existing MySQL data

There was no database dump, SQL schema, or reachable source database in the original repository. This change provides a fresh PostgreSQL schema matching the implemented authentication workflow; it does **not** transfer existing records. Before importing real users, obtain an authorized source export and map its actual columns. Preserve IDs and bcrypt hashes (`$2y$` hashes are supported), normalize email addresses and resolve case duplicates, map verification status and providers, and reconcile Google subject IDs. Do not copy active plaintext verification/reset tokens; invalidate them and require new codes. Set the PostgreSQL identity sequence after explicit-ID imports. Back up both databases and validate counts and sign-in before switching production traffic. No production data has been reset or modified.

## Tests

Integration tests require an isolated PostgreSQL database whose name ends in `_test`. They truncate that database's auth tables and mock Resend, so they never send real email:

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_hub_test npm test
```

Create the test database explicitly first. Without `TEST_DATABASE_URL`, these tests report **skipped**, which is not validation. Tests exercise registration, verification, sessions, login, password reset, replay rejection, sign-out, mail delivery failure, origin restrictions, and persistent rate limits. They do not verify real Neon connectivity, Resend delivery, Formspree delivery, or Google OAuth.

Expired session and rate-limit rows can be pruned periodically with:

```sql
DELETE FROM sessions WHERE expires_at < now();
DELETE FROM auth_limits WHERE expires_at < now();
```

## Live Neon validation

The requested `production` branch was verified with `neon config plan` and `neon deploy`; no infrastructure changes were needed. Deploy pulled `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_BRANCH` into ignored `.env.local`. The authentication migration completed, and the running Vite/Node app passed `npm run test:smoke` against live Neon (database insert, login, session lookup, logout and revocation). Smoke fixtures were removed. Build and lint passed. This does not deploy the frontend/API to Vercel. Resend credentials remain unconfigured, so live verification/reset email delivery has not been tested.

## Google sign-in for schoolhub-ri.vercel.app

In Google Cloud Console → Google Auth Platform → Clients, edit the existing **Web application** client and add these exact **Authorized JavaScript origins**:

- `https://schoolhub-ri.vercel.app`
- `http://localhost:5173` for local development

Keep production and local origins as separate entries. Do not include a path or trailing slash. For this Google Identity Services ID-token button flow, a redirect URI or OAuth client secret is not used. If the OAuth consent app is in Testing, add the accounts that will test it under the app's audience/test users.

Set these in Vercel for the intended deployment environment, then **redeploy**:

```text
APP_URL=https://schoolhub-ri.vercel.app
GOOGLE_CLIENT_ID=930878075584-tla117755do4gak6s9qqec5agdmqv6kk.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=930878075584-tla117755do4gak6s9qqec5agdmqv6kk.apps.googleusercontent.com
DATABASE_TRANSPORT=tcp
```

These client IDs are public and must match. Use the same client whose authorized origins you edited; if replacing it, update both variables. The new public client ID only reaches the browser after a rebuild. Database URLs and Resend keys remain server-only secrets. Changing this repo cannot change Google's Cloud Console settings.

## Browser login tests

Install Chromium on a machine with access to Playwright's browser CDN (`npx playwright install chromium`), then run:

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/school_hub_test npm run test:browser
```

The browser suite uses a separate disposable local database and starts its own API/Vite on port 5174. It exercises login validation, theme/password controls, network errors, signup/verification/resend, sessions, logout, reset, support success/failure, Google token exchange, and mobile layout. Resend, Formspree, Google's GIS script and certificate source are mocked: no email is sent and no real Google account is used. Google's JWT signature/audience/issuer/expiry verification still runs against test certificates. External provider delivery and real Google consent/origin configuration require a deployed-domain check.

In this cloud workspace the Playwright CDN is blocked. A Chromium binary obtained through the integrity-checked `@sparticuz/chromium` npm package was used via `BROWSER_EXECUTABLE=/tmp/chromium`; that executable path is optional, not required on normal development machines. The browser helper package lives outside this repo.
