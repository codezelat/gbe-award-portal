# GBE Awards Portal

Production application for the Global Business Excellence Awards 2026. It provides a secure public nomination flow, approval-first applicant access, payment and document operations, applicant self-service, staff administration, reporting, and audited communications.

**Production:** [access.gbeaward.com](https://access.gbeaward.com)

**Support:** [info@gbeaward.com](mailto:info@gbeaward.com)

## What is included

- Public guided nominations with four focused steps, configurable fee and payment instructions, Cloudflare Turnstile, exact validation, direct private R2 uploads, progress, cancellation, retry, and idempotent completion.
- Approval-first Better Auth accounts with expiring invitations, password recovery, session revocation, and mandatory staff TOTP MFA.
- Applicant application, profile, document, payment, message, security, and PDF-summary views with server-enforced field access.
- Administrative dashboards for applications, applicants, payments, files, communications, categories, cycles, staff, settings, exports, reports, and append-only activity history.
- Guarded status transitions, change requests, payment-proof replacement, reviewer assignment, audited corrections, and soft deletion/restoration.
- Signed private downloads, detected file-type checks, retention cleanup, CSV/XLSX exports, and a durable email outbox with Resend delivery webhooks.
- One Vercel Hobby-compatible daily maintenance cron plus event-driven email processing after application responses.

## Architecture

| Area | Implementation |
| --- | --- |
| Web | Next.js 16 App Router, React 19, strict TypeScript |
| UI | Tailwind CSS 4, shadcn/Base UI, responsive light-mode design |
| Database | Neon PostgreSQL, Drizzle ORM, versioned migrations |
| Authentication | Better Auth, invitation-only access, mandatory staff MFA |
| Files | Private Cloudflare R2, browser-to-R2 signed uploads |
| Abuse protection | Turnstile and atomic Neon-backed rate limiting |
| Email | Resend, React Email, durable outbox and signed webhooks |
| Documents | React PDF summaries and ExcelJS CSV/XLSX exports |
| Tests | Vitest, isolated PostgreSQL integration tests, Playwright |
| Hosting | Vercel with Cloudflare-managed DNS and providers |

The runtime database role has data-only permissions. Migrations use a separate owner connection. File bodies never pass through PostgreSQL or persist on Vercel's filesystem.

## Local development

Requirements: Bun, PostgreSQL access, and isolated non-production provider credentials.

```bash
bun install
cp .env.example .env
bun run env:verify
bun run db:migrate
bun run dev
```

Use Cloudflare's official Turnstile test keys locally. Do not reuse production Neon, R2, Resend, Better Auth, or signing credentials in development or preview environments.

To seed a new environment, supply approved ISO timestamps before running the seed:

```bash
SEED_CYCLE_OPENS_AT=2026-01-01T00:00:00.000Z \
SEED_CYCLE_CLOSES_AT=2026-12-31T23:59:59.999Z \
bun run db:seed
```

The seeded cycle intentionally remains a draft. A super administrator must review the dates, legal copy, categories, fee settings, and feature flags before opening nominations.

For the first staff account only, set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and a 16+ character `BOOTSTRAP_ADMIN_PASSWORD`, run `bun run db:bootstrap-admin`, then remove all three values immediately and enrol MFA.

## Environment configuration

Start from [.env.example](./.env.example). The important boundaries are:

- `DATABASE_URL`: pooled, least-privilege runtime connection.
- `DATABASE_URL_DIRECT`: migration-owner connection; never configure it in the Vercel runtime.
- `R2_PRIVATE_BUCKET`: private uploads and exports. Do not attach a public domain.
- `R2_OBJECT_PREFIX`: optional strict environment/test isolation inside a bucket.
- `EMAIL_FROM`: verified Resend sender, currently `GBE Awards <info@access.gbeaward.com>`.
- `EMAIL_REPLY_TO` and `SUPPORT_EMAIL`: inbound mailbox, `info@gbeaward.com`.
- `RESEND_WEBHOOK_SECRET`, `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`, and `CRON_SECRET`: encrypted server-only secrets.

Run the production-aware provider verifier after configuring an environment:

```bash
bun run providers:verify
```

It checks database access, restricted runtime permissions, private R2 read/write/delete and browser CORS, Resend sender configuration, rate limiting, and Turnstile hostname policy.

## Database operations

Migrations under `drizzle/migrations` are append-only.

```bash
bun run db:generate   # generate and review a schema migration
bun run db:migrate    # apply reviewed migrations with the owner URL
bun run db:studio     # local inspection only
```

Never run `db:push` against staging or production. Take a Neon branch or restore point before production schema changes and periodically prove restoration.

## Quality gates

```bash
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run test:e2e
bun run build
bun audit
```

The Playwright harness creates an isolated Neon test database, applies every migration, uses a dedicated R2 prefix, exercises desktop and mobile nomination flows, recovers failed uploads, validates rejected files, enrols staff MFA, searches applications, downloads a real Excel export, and removes test objects afterward.

## Deployment and operations

Production deploys from `main` to Vercel. Before pushing a release:

1. Apply backward-compatible migrations with the direct owner URL.
2. Run all quality gates plus `env:verify` and `providers:verify`.
3. Confirm `/api/health` is ready and the previous deployment remains available for rollback.
4. Push `main`, wait for the Vercel deployment to become `Ready`, and verify the `access.gbeaward.com` alias.
5. Exercise login/MFA, one private upload/download, the daily cron, and Resend delivery-webhook state.

The single `/api/cron/daily` route handles email retries, abandoned uploads, expired exports, retention tasks, and stale rate-limit buckets. Operational failures are visible in the admin portal's communications and activity views.

## Launch control

Deployment does not automatically open nominations. Launch is an explicit super-administrator action after approved terms, privacy copy, dates, categories, fees, staff access, backup readiness, and email deliverability have been reviewed. This keeps infrastructure release separate from the business decision to accept applications.
