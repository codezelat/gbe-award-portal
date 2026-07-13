# GBE Awards Portal — Agent Guide

This file is the repository operating guide for coding agents and maintainers. It is intentionally specific: follow the code and commands in this repository over generic framework habits. User instructions and any nested `AGENTS.md` take precedence.

## 1. Start here

This is a production Next.js 16 application for the Global Business Excellence Awards 2026. It handles public nominations, private applicant access, staff operations, payment/document evidence and personal information.

Before changing anything:

1. Read the relevant page, route handler, server action and test—not only the component that appears on screen.
2. For any Next.js implementation, read the matching guide under `node_modules/next/dist/docs/` first. This project uses Next.js 16 and its App Router APIs may differ from earlier releases.
3. Inspect the current worktree with `git status --short --branch`; do not overwrite unrelated or user-owned edits.
4. Treat `README.md` as the product and operational reference, and keep it aligned if a user-facing, provider, route or command contract changes.

## 2. Repository map

| Path                                              | Responsibility                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`                                        | App Router pages, route handlers, layouts, metadata, loading and error boundaries. `apply` is public; `portal` is applicant-only; `admin` is staff-only. |
| `src/components/`                                 | Shared UI, form, upload, applicant and admin presentation components. Prefer existing primitives in `src/components/ui/`.                                |
| `src/server/`                                     | Server actions, data-access layer, business services, jobs and security controls. Keep privileged work here.                                             |
| `src/lib/`                                        | Environment parsing, database, Better Auth, R2 client, domain and export utilities.                                                                      |
| `src/config/`                                     | Award branding, navigation and role-permission definitions.                                                                                              |
| `src/emails/`                                     | React Email components and templates.                                                                                                                    |
| `drizzle/migrations/`                             | Append-only PostgreSQL migration history.                                                                                                                |
| `scripts/`                                        | Environment/provider verification, cycle seeding and one-time first-admin bootstrap.                                                                     |
| `tests/unit/`, `tests/integration/`, `tests/e2e/` | Unit, database-integrity and browser coverage.                                                                                                           |
| `public/brand/`                                   | Versioned public logo/artwork. Never store private applicant files here.                                                                                 |

## 3. Commands

Use **Bun 1.3.12**. Do not introduce npm, pnpm or another lockfile.

```bash
bun install
bun run dev
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run test:e2e
bun run build
bun run check
bun run env:verify
bun run providers:verify
```

Database commands:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
bun run db:seed
bun run db:bootstrap-admin
```

- `db:migrate` uses `DATABASE_URL_DIRECT`; it is for reviewed migrations.
- Never use `db:push` against staging or production.
- `test:integration` recreates a guarded `gbe_award_portal_test*` database.
- `test:e2e` recreates `gbe_award_portal_test_e2e` and uses the `e2e/playwright` R2 prefix. Never aim either suite at production.

## 4. Architecture and ownership boundaries

### Rendering and data access

- Default to Server Components in `src/app/`. Add `"use client"` only when browser state, effects or event handlers genuinely require it.
- Put authorization, data access, workflow transitions, signing and provider calls on the server. Do not move privileged logic into client components or expose server-only environment values.
- Use `src/server/dal/auth.ts` for private route guards. `requirePortalSession()` enforces an active applicant/staff profile; `requireStaff()` additionally enforces staff membership and TOTP MFA.
- `src/proxy.ts` is an early redirect guard, not the final authorization layer. Every sensitive action must still be verified server-side.
- Follow the existing import aliases (`@/…`) and strict TypeScript. Do not suppress errors with `any`, `@ts-ignore` or unsafe casts when a real type can be expressed.

### Domain rules

- Preserve `src/lib/domain/application-status.ts` and the transition service as the source of truth for nomination status changes. Do not update workflow state from arbitrary UI code.
- Internal access has two levels: `staff` for the complete nomination workflow and `super_admin` for people/system governance. Permission checks use `src/lib/domain/permissions.ts` and `src/config/permissions.ts`; do not rely on hidden navigation or client rendering as access control.
- Award-cycle data, fee settings, legal text, categories, programme copy and opening status are business-controlled content. Do not silently alter them during technical work. Ask for explicit direction when a change goes beyond the requested scope.
- References must remain opaque, non-sequential and unique. Do not replace their random six-digit suffix with a count or predictable ID.

### Files and exports

- File bytes belong in Cloudflare R2, never in PostgreSQL, `public/`, the repository or Vercel’s filesystem.
- Keep uploads private. Use the existing presign/complete routes, object-key prefixing, detected-type checks and signed download flow.
- Respect existing size, quantity, ownership, purpose and disposition checks. Do not trust browser MIME types or filenames.
- Use a dedicated R2 prefix for tests/previews. Do not reuse production objects or buckets for test data.

### Authentication, email and jobs

- Better Auth is invitation-only (`disableSignUp: true`); public nomination does not create an account. Do not add a generic sign-up route.
- Staff MFA is mandatory. Keep the existing QR/manual TOTP enrolment and challenge flows compatible with standard authenticator apps.
- Email is a durable outbox. Queue mail through the established flow; do not send ad-hoc messages directly from a page/action when delivery tracking and retry are required.
- Verify Resend webhook signatures before changing state.
- Vercel Hobby uses exactly one scheduled entry: `/api/cron/daily` in `vercel.json`. Add work to the daily dispatcher or event-driven processing; do not add duplicate cron schedules.

## 5. Security and environment rules

- Never read, print, commit, paste into code, or include in screenshots any value from `.env`. Only `.env.example` belongs in Git.
- Keep `DATABASE_URL` (least-privilege runtime/pooler) and `DATABASE_URL_DIRECT` (migration owner) distinct. The direct owner URL must not be configured in the Vercel runtime.
- Maintain the security headers and CSP in `next.config.ts`. When adding a legitimate third-party browser origin, make the narrowest possible change and test the affected flow.
- Preserve Turnstile action and hostname verification, request rate limits and server-side validation. Production must not use Turnstile test keys.
- Do not log tokens, passwords, signed URLs, raw payment data, personal data or provider responses containing them.
- Treat all uploaded documents, emails and webhook payloads as untrusted input.

## 6. UI, accessibility and responsive behavior

- Reuse existing shared components and design tokens. Avoid new one-off design systems or heavy dependencies for a local change.
- Keep the interface clear, minimal and touch-friendly. Test compact navigation, forms, tables, bulk actions and pagination on phone and tablet widths; desktop layouts must not force horizontal page overflow.
- Match each route’s loading boundary to its actual layout. Do not replace tailored skeletons with a generic unrelated placeholder.
- Preserve semantic labels, keyboard flow, visible focus, error summaries, skip link, sufficient touch targets and `aria-*` relationships. For public-flow changes, use the existing Axe/Playwright coverage as a baseline.
- Protected applicant/admin pages must retain `noindex`; public metadata and artwork belong in the root/public layouts only.

## 7. Database and migration discipline

- Edit `src/lib/db/schema.ts`, generate a migration with `bun run db:generate`, inspect the SQL and commit the schema and migration together.
- Do not edit an applied migration, migration snapshots or `_journal.json` to rewrite history.
- Prefer additive, backward-compatible migrations. Plan rollout and cleanup separately when a column or behavior must be removed.
- Before production schema work, require a Neon restore point or branch and a rollback plan. Apply reviewed migrations before code that depends on them.

## 8. Verification standard

Run the narrowest useful checks while iterating, then the full relevant gate before handoff:

| Change                                         | Minimum verification                                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| UI/copy/layout                                 | `bun run lint`, `bun run typecheck`, targeted Playwright/Vitest test; inspect desktop and mobile rendering.                                   |
| Shared component/layout                        | `bun run check` and affected Playwright paths, including overflow and loading behavior.                                                       |
| Validation, permissions, workflow or API route | Unit coverage plus the affected integration/E2E scenario.                                                                                     |
| Database migration                             | Schema/migration review, `bun run db:migrate` on an isolated database, relevant integration tests.                                            |
| Provider, upload, auth, email or cron change   | `bun run env:verify`, `bun run providers:verify`, targeted E2E and real non-production provider verification.                                 |
| Release                                        | `bun run check`, relevant integration/E2E suite, `git diff --check`, clean intended worktree, Vercel Ready state and post-deploy smoke check. |

Do not claim a route, provider or deployment works merely because it compiles. State what was actually exercised and any external dependency still requiring the owner’s action.

## 9. Change and release hygiene

- Keep changes focused. Preserve unrelated work in a dirty tree and do not use destructive Git commands without explicit approval.
- Review `git diff --check` before committing. Commit only intended files with a concise, imperative message.
- Do not add GitHub Actions/workflows unless the user explicitly requests them.
- Do not push, alter Vercel configuration, change provider settings, run production migrations, send real email, open/close an award cycle or modify production data without explicit authorization.
- After a production push, wait for the Vercel deployment to be `Ready`, confirm the `access.gbeaward.com` alias, and smoke-test public endpoints. Authenticate protected production routes only with authorized access.

## 10. Documentation rule

When a route, command, provider contract, environment variable, safety control or operations workflow changes, update `README.md` and this file if the guidance is affected. Documentation must use actual paths and commands from the repository—never placeholders, invented services or unverified claims.
