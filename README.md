# GBE Awards Portal

Production portal for public nominations, approval-first applicant access, payment/document workflows and GBE Awards administration. [SPEC.md](./SPEC.md) is the product contract.

## Stack

Next.js 16 App Router, strict TypeScript, Bun, Tailwind CSS 4, shadcn/Base UI, Neon PostgreSQL with Drizzle, Better Auth, private Cloudflare R2 uploads, Turnstile, Resend/React Email, durable rate limiting, ExcelJS, Vitest and Playwright.

## Local setup

1. Install Bun and PostgreSQL, then run `bun install`.
2. Copy `.env.example` to `.env` and use isolated development providers. Never reuse production credentials.
3. Create separate Neon roles/URLs: `DATABASE_URL_DIRECT` is the migration owner; `DATABASE_URL` is the least-privilege runtime role with no DDL rights.
4. Run `bun run env:verify`, `bun run db:migrate`, then set approved `SEED_CYCLE_OPENS_AT`/`SEED_CYCLE_CLOSES_AT` and run `bun run db:seed`.
5. For the first deployment only, set the three `BOOTSTRAP_ADMIN_*` values, run `bun run db:bootstrap-admin`, remove those values immediately, sign in and enrol MFA.
6. Run `bun run dev`. The seeded cycle remains draft until a super administrator approves legal content, categories and activation.

Runtime uploads never touch the repository, Vercel filesystem or PostgreSQL byte columns. Browsers upload directly to private R2 with object-specific ten-minute URLs; downloads use reauthorised three-minute URLs.

## Provider configuration

- R2: create separate private runtime and public brand buckets. The private bucket must have no public domain. Permit `PUT` from the exact portal origin with `content-type`; configure lifecycle rules to agree with the 24-hour provisional/export cleanup and approved superseded-file retention.
- Turnstile: use the official test keys locally and exact comma-separated approved hostnames in `TURNSTILE_EXPECTED_HOSTNAME`. Production must not include `localhost`.
- Resend: verify the sending domain, configure `EMAIL_FROM`, keep `info@gbeaward.com` as reply-to, and send signed webhook events to `/api/webhooks/resend`.
- Better Auth: use a unique 32+ character secret per environment, the canonical HTTPS portal URL, secure cookies and invitation-only accounts.
- Rate limiting: Upstash is supported when configured; otherwise the atomic Neon-backed limiter is used and expired buckets are cleaned by retention processing.
- Vercel Hobby: set `CRON_SECRET`; `vercel.json` contains one daily maintenance cron. Normal emails are processed after the originating response, while the daily run handles retries, stale uploads, exports and retention.

After configuring live providers, run `bun run providers:verify`. It verifies the database, performs and removes a small R2 test object, checks real browser CORS preflight, validates the configured Resend sender when the key permits domain reads, and checks rate-limit/Turnstile policy.

## Database and backups

`drizzle/migrations` is append-only and includes constraints, operational indexes and PostgreSQL trigram search indexes. Apply migrations with `bun run db:migrate`; generate reviewed changes with `bun run db:generate`. Never run `db:push` against staging or production.

Enable Neon point-in-time restore according to the organisation’s recovery target, take a labelled branch/snapshot before migrations, and test restoration periodically. R2 lifecycle/deletion policy must be backed up or versioned according to approved privacy policy; database backups do not contain file bodies.

## Quality gates

```bash
bun run lint
bun run typecheck
bun run test
TEST_DATABASE_ADMIN_URL=postgresql://.../postgres \
TEST_DATABASE_URL=postgresql://.../gbe_award_portal_test_local \
  bun run test:integration
bun run test:e2e
bun run build
```

`bun run check` runs lint, type checking, unit tests and the production build. Run the isolated PostgreSQL integration suite and desktop/mobile Playwright suite before release.

## Production release checklist

- Apply migrations with the owner role, then confirm the application uses only the restricted runtime role.
- Run `env:verify`, `providers:verify`, the complete quality suite and a migration dry run on staging.
- Verify R2 CORS, private access, upload/download signatures, orphan cleanup and lifecycle rules using staging objects.
- Verify Turnstile hostname/action checks, Resend delivery/webhook transitions and an email retry.
- Confirm every active staff member has MFA; suspend unused accounts and revoke their sessions.
- Exercise public submission, approval/invitation, applicant activation, requested changes, replacement payment proof, status release and filtered XLSX/CSV export.
- Check `/api/health`, scheduled job results, failed email queues, security headers, noindex on auth/portal/admin routes and mobile/desktop layouts.
- Verify Neon restore readiness and record the release/migration identifiers in the operational change log.

Deploy the application to Vercel behind Cloudflare using isolated preview/staging/production Neon, R2, Redis and Resend resources. Do not deploy with test Turnstile keys, bootstrap credentials, migration-owner runtime credentials or unapproved retention values.
